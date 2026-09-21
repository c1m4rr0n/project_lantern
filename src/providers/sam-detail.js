import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {enrichmentError, safeEnrichmentError, responseError} from './enrichment-error.js';
import {setTimeout as sleep} from 'node:timers/promises';
import {isSamBudgetError} from '../ops/sam-request-budget.js';

const SAFE_ID = /^[a-zA-Z0-9._-]{1,160}$/;
const ALLOWED_HOSTS = new Set(['api.sam.gov', 'api-alpha.sam.gov']);

function stripMarkup(input = '') {
  return String(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function safeSamDescriptionUrl(rawUrl, apiKey) {
  if (!rawUrl) throw enrichmentError('not_found');
  let url; try { url = new URL(rawUrl); } catch { throw enrichmentError('not_found'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw enrichmentError('not_found');
  url.searchParams.set('api_key', apiKey);
  return url;
}

export async function fetchSamDescription({ apiKey, descriptionUrl, fetchImpl = fetch, wait = sleep, now = Date.now, beforeRequest = () => {} }) {
  if (!apiKey) throw enrichmentError('configuration');
  const url = safeSamDescriptionUrl(descriptionUrl, apiKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      beforeRequest();
      // Shared admission starts the timeout and rechecks provider cooldown after pacing.
      const response = await fetchImpl(url, { redirect: 'error', samRequestTimeoutMs:10_000, samBeforeDispatch:beforeRequest, signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'ExcluSignal/1.0 opportunity-enrichment', accept: 'text/plain,text/html,application/json;q=0.8' } });
      if (!response.ok) throw responseError(response, now());
      let raw = await response.text();
      if (raw.length > 1_000_000) throw enrichmentError('malformed', response.status);
      if (response.headers?.get('content-type')?.includes('json') || /^[\s]*[{"\[]/.test(raw)) {
        let data; try { data = JSON.parse(raw); } catch { throw enrichmentError('malformed', response.status); }
        if (typeof data === 'string') raw = data;
        else if (typeof data?.description === 'string') raw = data.description;
        else if (typeof data?.description?.body === 'string') raw = data.description.body;
        else if (/^description not found[.!]?$/i.test(String(data?.message || data?.error || '').trim())) throw enrichmentError('not_found', response.status);
        else throw enrichmentError('malformed', response.status);
      }
      const description = stripMarkup(raw);
      if (!description || /^description not found[.!]?$/i.test(description)) throw enrichmentError('not_found', response.status);
      if (/<title[^>]*>\s*(?:error|access denied|unauthorized|service unavailable)/i.test(raw)) throw enrichmentError('malformed', response.status);
      return description.slice(0, 250_000);
    } catch (error) {
      if (isSamBudgetError(error)) throw error;
      const safe = safeEnrichmentError(error);
      if (safe.category !== 'temporarily_unavailable' || attempt === 2) throw safe;
      await wait(500 * 2 ** attempt);
    }
  }
}

async function readCache(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeCache(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, path);
}

export class SamDetailCache {
  constructor({ root, apiKey, ttlMs = 6 * 60 * 60_000, maxStaleMs = 7 * 24 * 60 * 60_000, now = () => Date.now(), fetchImpl = fetch, wait = sleep, log = entry => console.warn(JSON.stringify(entry)) }) {
    this.root = root;
    this.apiKey = apiKey;
    this.ttlMs = ttlMs;
    this.maxStaleMs = maxStaleMs;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.wait = wait; this.log = log; this.cooldown = null;
    this.inflight = new Map();
  }

  async get({ id, descriptionUrl, forceRefresh = false }) {
    if (!SAFE_ID.test(String(id))) throw new Error('invalid opportunity id');
    const path = join(this.root, `${id}.json`);
    const stored = await readCache(path);
    const cached = typeof stored?.description === 'string' && stored.description.trim() ? stored : null;
    const age = cached?.fetchedAt ? this.now() - Date.parse(cached.fetchedAt) : Infinity;
    if (!forceRefresh && cached && age >= 0 && age <= this.ttlMs) return { ...cached, cache: 'hit' };
    if (this.inflight.has(id)) return this.inflight.get(id);

    const task = Promise.resolve().then(async () => {
      try {
        const beforeRequest = () => { if (this.cooldown && Date.parse(this.cooldown.retryAt) > this.now()) throw this.cooldown; };
        const description = await fetchSamDescription({ apiKey: this.apiKey, descriptionUrl, fetchImpl: this.fetchImpl, now: this.now, wait: this.wait, beforeRequest });
        const result = { fetchedAt: new Date(this.now()).toISOString(), description, cache: cached ? 'refresh' : 'miss' };
        await writeCache(path, { fetchedAt: result.fetchedAt, description });
        return result;
      } catch (error) {
        if(isSamBudgetError(error))throw error;
        const safe = safeEnrichmentError(error);
        if (safe.category === 'rate_limited') this.cooldown = safe;
        this.log({ event: 'sam_description_failure', category: safe.category, upstreamStatus: safe.upstreamStatus });
        if (cached && age >= 0 && age <= this.maxStaleMs) return { ...cached, cache: 'stale-fallback', upstreamError: safe.code, upstreamStatus: safe.upstreamStatus };
        throw safe;
      } finally {
        this.inflight.delete(id);
      }
    });
    this.inflight.set(id, task);
    return task;
  }
}
