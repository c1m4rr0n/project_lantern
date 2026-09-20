import { join } from 'node:path';
import { createDiscoveryProvider } from '../providers/discovery-provider.js';
import { SamDetailCache } from '../providers/sam-detail.js';
import { SamWatchCache } from '../providers/sam-watch.js';
import { fetchUsaSpendingContext } from '../providers/usaspending.js';
import { fetchMockMarketContext } from '../providers/mock-market.js';
import { SamExclusionsProvider } from '../providers/sam-exclusions.js';
import { MockExclusionsProvider } from '../providers/mock-exclusions.js';
import {SamRequestBudget} from '../ops/sam-request-budget.js';

export function createProviders({ env = process.env, dataRoot, fetchImpl = fetch }) {
  const providerName = env.DATA_PROVIDER || (env.SAM_API_KEY ? 'sam' : 'mock');
  const samBudget=new SamRequestBudget({path:join(dataRoot,'ops/sam-request-budget.json'),limit:env.SAM_DAILY_REQUEST_BUDGET});
  const provider = createDiscoveryProvider({providerName,env,dataRoot,fetchImpl:samBudget.wrap(fetchImpl,'discovery')});
  provider.budget=samBudget;
  provider.withRequestContext=(context,fn)=>samBudget.run(context,fn);
  const detailProvider = providerName === 'sam' && env.SAM_API_KEY
    ? new SamDetailCache({
        root:join(dataRoot, 'cache/sam-details'),
        apiKey:env.SAM_API_KEY,
        ttlMs:Number(env.SAM_DETAIL_CACHE_TTL_MS || 21600000),
        maxStaleMs:Number(env.SAM_DETAIL_MAX_STALE_MS || 604800000),
        fetchImpl:samBudget.wrap(fetchImpl,'description')
      })
    : null;
  const watchProvider = providerName === 'sam' && env.SAM_API_KEY
    ? new SamWatchCache({
        root:join(dataRoot, 'cache/sam-watch'),
        apiKey:env.SAM_API_KEY,
        ttlMs:Number(env.SAM_WATCH_CACHE_TTL_MS || 1800000),
        maxStaleMs:Number(env.SAM_WATCH_MAX_STALE_MS || 604800000),
        fetchImpl:samBudget.wrap(fetchImpl,'tracked-notice')
      })
    : null;
  const marketProviderName = env.MARKET_PROVIDER || 'mock';
  const marketProvider = marketProviderName === 'usaspending' ? fetchUsaSpendingContext : fetchMockMarketContext;
  const exclusionProviderName = env.EXCLUSION_PROVIDER || (env.SAM_API_KEY ? 'sam-extract' : 'unavailable');
  const exclusionProvider = exclusionProviderName === 'sam-extract' && env.SAM_API_KEY
    ? new SamExclusionsProvider({
        root:join(dataRoot,'cache/sam-exclusions'),
        apiKey:env.SAM_API_KEY,
        ttlMs:Number(env.SAM_EXCLUSIONS_CACHE_TTL_MS || 20*60*60*1000),
        maxStaleMs:Number(env.SAM_EXCLUSIONS_MAX_STALE_MS || 72*60*60*1000),
        timeoutMs:Number(env.SAM_EXCLUSIONS_TIMEOUT_MS || 300000),
        fetchImpl:samBudget.wrap(fetchImpl,'exclusions')
      })
    : exclusionProviderName === 'mock' ? new MockExclusionsProvider() : null;
  return { providerName, provider, detailProvider, watchProvider, marketProviderName, marketProvider, exclusionProviderName, exclusionProvider };
}
