import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
  if (!rawUrl) throw new Error('SAM description URL is missing');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error('Untrusted SAM description URL');
  url.searchParams.set('api_key', apiKey);
  return url;
}

export async function fetchSamDescription({ apiKey, descriptionUrl, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('SAM_API_KEY is required for description enrichment');
  const url = safeSamDescriptionUrl(descriptionUrl, apiKey);
  const response = await fetchImpl(url, { headers: { 'user-agent': 'ExcluSignal/0.9 opportunity-enrichment', accept: 'text/plain,text/html,application/json;q=0.8' } });
  if (!response.ok) throw new Error(`SAM.gov description request failed: ${response.status}`);
  const raw = await response.text();
  return stripMarkup(raw).slice(0, 250_000);
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
  constructor({ root, apiKey, ttlMs = 6 * 60 * 60_000, maxStaleMs = 7 * 24 * 60 * 60_000, now = () => Date.now(), fetchImpl = fetch }) {
    this.root = root;
    this.apiKey = apiKey;
    this.ttlMs = ttlMs;
    this.maxStaleMs = maxStaleMs;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.inflight = new Map();
  }

  async get({ id, descriptionUrl, forceRefresh = false }) {
    if (!SAFE_ID.test(String(id))) throw new Error('invalid opportunity id');
    const path = join(this.root, `${id}.json`);
    const cached = await readCache(path);
    const age = cached?.fetchedAt ? this.now() - Date.parse(cached.fetchedAt) : Infinity;
    if (!forceRefresh && cached && age >= 0 && age <= this.ttlMs) return { ...cached, cache: 'hit' };
    if (this.inflight.has(id)) return this.inflight.get(id);

    const task = (async () => {
      try {
        const description = await fetchSamDescription({ apiKey: this.apiKey, descriptionUrl, fetchImpl: this.fetchImpl });
        const result = { fetchedAt: new Date(this.now()).toISOString(), description, cache: cached ? 'refresh' : 'miss' };
        await writeCache(path, { fetchedAt: result.fetchedAt, description });
        return result;
      } catch (error) {
        if (cached && age <= this.maxStaleMs) return { ...cached, cache: 'stale-fallback', upstreamError: error.message };
        throw error;
      } finally {
        this.inflight.delete(id);
      }
    })();
    this.inflight.set(id, task);
    return task;
  }
}
