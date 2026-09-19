import { resolve } from 'node:path';
import { SamExclusionsProvider } from '../src/providers/sam-exclusions.js';

const dataRoot = resolve(process.env.DATA_ROOT || './runtime');
const apiKey = process.env.SAM_API_KEY;
if (!apiKey) {
  console.error(JSON.stringify({ ok:false, error:'SAM_API_KEY is not configured' }));
  process.exit(1);
}

const provider = new SamExclusionsProvider({
  root:resolve(dataRoot, 'cache', 'sam-exclusions'),
  apiKey,
  ttlMs:Number(process.env.SAM_EXCLUSIONS_CACHE_TTL_MS || 72_000_000),
  maxStaleMs:Number(process.env.SAM_EXCLUSIONS_MAX_STALE_MS || 259_200_000),
  timeoutMs:Number(process.env.SAM_EXCLUSIONS_TIMEOUT_MS || 300_000)
});

try {
  const snapshot = await provider.getSnapshot({ force:process.argv.includes('--force') });
  console.log(JSON.stringify({
    ok:true,
    provider:'sam-exclusions-extract',
    sourceDate:snapshot.sourceDate || null,
    sourceFile:snapshot.sourceFile || null,
    firmRecords:Array.isArray(snapshot.records) ? snapshot.records.length : null,
    sha256Prefix:snapshot.sha256 ? snapshot.sha256.slice(0,12) : null,
    cache:snapshot.cache || null,
    stale:Boolean(snapshot.stale),
    fetchedAt:snapshot.fetchedAt || null
  }));
} catch (error) {
  console.error(JSON.stringify({ ok:false, error:String(error?.message || error) }));
  process.exit(1);
}
