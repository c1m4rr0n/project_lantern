import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { normalizeSamOpportunity } from './sam.js';
import {isSamBudgetError} from '../ops/sam-request-budget.js';

const SAFE_ID = /^[a-zA-Z0-9._-]{1,160}$/;

function fmt(date) {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${m}/${d}/${date.getUTCFullYear()}`;
}

function dateWindow(postedDate, now = new Date()) {
  const posted = postedDate ? new Date(postedDate) : null;
  if (posted && !Number.isNaN(posted.getTime())) {
    const from = new Date(posted);
    const to = new Date(posted);
    from.setUTCDate(from.getUTCDate() - 1);
    to.setUTCDate(to.getUTCDate() + 1);
    return { from, to };
  }
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 364);
  return { from, to };
}

export function buildSamNoticeSearchUrl({ apiKey, noticeId, postedDate = null, now = new Date() }) {
  if (!apiKey) throw new Error('SAM_API_KEY is required for watch refresh');
  if (!SAFE_ID.test(String(noticeId))) throw new Error('invalid opportunity id');
  const { from, to } = dateWindow(postedDate, now);
  const url = new URL('https://api.sam.gov/opportunities/v2/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('noticeid', String(noticeId));
  url.searchParams.set('postedFrom', fmt(from));
  url.searchParams.set('postedTo', fmt(to));
  url.searchParams.set('limit', '1');
  url.searchParams.set('offset', '0');
  return url;
}

export async function fetchSamOpportunityById({ apiKey, noticeId, postedDate = null, now = new Date(), fetchImpl = fetch }) {
  const url = buildSamNoticeSearchUrl({ apiKey, noticeId, postedDate, now });
  const response = await fetchImpl(url, { headers:{ 'user-agent':'ExcluSignal/1.0 change-watch' } });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`SAM.gov watch request failed: ${response.status}${body ? ` ${body}` : ''}`);
  }
  const data = await response.json();
  const row = Array.isArray(data.opportunitiesData) ? data.opportunitiesData[0] : null;
  return row ? normalizeSamOpportunity(row) : null;
}

async function readCache(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writeCache(path, value) {
  await mkdir(dirname(path), { recursive:true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, path);
}

export class SamWatchCache {
  constructor({ root, apiKey, ttlMs = 30 * 60_000, maxStaleMs = 7 * 24 * 60 * 60_000, now = () => Date.now(), fetchImpl = fetch }) {
    this.root=root; this.apiKey=apiKey; this.ttlMs=ttlMs; this.maxStaleMs=maxStaleMs; this.now=now; this.fetchImpl=fetchImpl; this.inflight=new Map();
  }
  async get({ id, postedDate = null }) {
    if (!SAFE_ID.test(String(id))) throw new Error('invalid opportunity id');
    const path=join(this.root, `${id}.json`);
    const cached=await readCache(path);
    const age=cached?.fetchedAt ? this.now()-Date.parse(cached.fetchedAt) : Infinity;
    if (cached && age >= 0 && age <= this.ttlMs) return { ...cached, cache:'hit' };
    if (this.inflight.has(id)) return this.inflight.get(id);
    const task=(async()=>{
      try {
        const item=await fetchSamOpportunityById({apiKey:this.apiKey,noticeId:id,postedDate,now:new Date(this.now()),fetchImpl:this.fetchImpl});
        const result={fetchedAt:new Date(this.now()).toISOString(),item};
        await writeCache(path,result);
        return {...result,cache:cached?'refresh':'miss'};
      } catch(error) {
        if(isSamBudgetError(error))throw error;
        if(cached && age <= this.maxStaleMs) return {...cached,cache:'stale-fallback',upstreamError:error.message};
        throw error;
      } finally { this.inflight.delete(id); }
    })();
    this.inflight.set(id,task);
    return task;
  }
}
