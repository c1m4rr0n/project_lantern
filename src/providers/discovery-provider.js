import {join} from 'node:path';
import {SamDiscoveryPages} from './sam-discovery.js';
import {fetchMockOpportunities} from './mock.js';
import {discoverOpportunities,discoveryConfig,integer} from '../domain/discovery.js';

export function createDiscoveryProvider({providerName,env,dataRoot,fetchImpl=fetch,log=entry=>console.log(JSON.stringify(entry))}) {
  const pages=new SamDiscoveryPages({root:join(dataRoot,'cache/sam-discovery'),apiKey:env.SAM_API_KEY,env,fetchImpl});
  const config=discoveryConfig(env);
  const page=providerName==='sam'?args=>pages.get(args):async({query,offset,limit})=>{
    const all=(await fetchMockOpportunities()).filter(item=>query.ncode?(item.naics||[]).includes(query.ncode):String(item.title).toLowerCase().includes(query.title));
    const items=all.slice(offset*limit,(offset+1)*limit);
    return {items,totalRecords:all.length,rawCount:items.length,cache:'hit'};
  };
  const provider=async profile=>(await provider.discover(profile)).items;
  provider.freshnessMs=integer(env.DISCOVERY_FRESHNESS_MS,integer(env.OPPORTUNITY_CACHE_TTL_MS,900000,1000,86400000),1000,86400000);
  provider.discover=async profile=>{
    try{
      const lease=provider.budget?.current().lease;
      // A fair scheduled grant bounds this discovery, leaving other tenants' grants reserved.
      const effective=lease?.remaining>0?{...config,maxRequests:Math.min(config.maxRequests,lease.remaining)}:config;
      const result=await discoverOpportunities({profile,page,config:effective});
      log({event:'opportunity.discovery',...result.summary});
      return result;
    }catch(error){
      log({event:'opportunity.discovery.failed',...error.discoverySummary,code:String(error.code||'discovery_failed').startsWith('discovery_')?error.code:'discovery_failed'});
      throw error;
    }
  };
  // Public health must not reveal tenant-specific plans, scores, profiles or counts.
  provider.meta=()=>({cache:'query-scoped',provider:providerName});
  return provider;
}
