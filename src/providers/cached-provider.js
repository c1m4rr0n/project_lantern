import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function readCache(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeCache(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, path);
}

export function makeCachedProvider({ provider, path, ttlMs = 15 * 60_000, maxStaleMs = 24 * 60 * 60_000, now = () => Date.now() }) {
  let inflight = null;
  let lastMeta = { cache: 'empty', fetchedAt: null };

  async function fetchCached() {
    const cached = await readCache(path);
    const age = cached?.fetchedAt ? now() - Date.parse(cached.fetchedAt) : Infinity;
    if (cached && age >= 0 && age <= ttlMs) {
      lastMeta = { cache: 'hit', fetchedAt: cached.fetchedAt, ageMs: age };
      return cached.items || [];
    }
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const items = await provider();
        const fetchedAt = new Date(now()).toISOString();
        await writeCache(path, { fetchedAt, items });
        lastMeta = { cache: cached ? 'refresh' : 'miss', fetchedAt, ageMs: 0 };
        return items;
      } catch (error) {
        if (cached && age <= maxStaleMs) {
          lastMeta = { cache: 'stale-fallback', fetchedAt: cached.fetchedAt, ageMs: age, upstreamError: error.message };
          return cached.items || [];
        }
        throw error;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  fetchCached.meta = () => ({ ...lastMeta, ...(lastMeta.upstreamError?{upstreamError:'upstream_unavailable'}:{}) });
  return fetchCached;
}
