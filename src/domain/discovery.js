import { createHash } from 'node:crypto';
import { scoreOpportunity } from './scoring.js';

export const HORIZONS=[30,90,180,365];
export const integer=(value,fallback,min,max)=>{const n=Number(value);return value==null||value===''||!Number.isFinite(n)?fallback:Math.min(max,Math.max(min,Math.floor(n)));};
export function discoveryConfig(env={}) {
  return {pageSize:integer(env.SAM_OPPORTUNITY_PAGE_SIZE,500,1,1000),maxRaw:integer(env.DISCOVERY_MAX_RAW_CANDIDATES,5000,1,10000),maxRequests:integer(env.DISCOVERY_MAX_API_REQUESTS,20,1,50),targetRelevant:integer(env.DISCOVERY_TARGET_RELEVANT,250,1,2000),targetStrong:integer(env.DISCOVERY_TARGET_STRONG,50,1,500),retainRelevant:integer(env.DISCOVERY_RETAIN_RELEVANT,500,1,2000),retainExploration:integer(env.DISCOVERY_RETAIN_EXPLORATION,100,0,500),maxElapsedMs:integer(env.DISCOVERY_MAX_ELAPSED_MS,120000,1000,180000)};
}
export const profileFingerprint=profile=>createHash('sha256').update(JSON.stringify(profile)).digest('hex');
const unique=values=>[...new Set(values)];
const STOP=new Set('and the for with services service solutions solution support company business general professional management provide providing'.split(' '));
const STATES=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP'.split(' '));
export function planDiscovery(profile={}) {
  profile ||= {};
  const naics=unique((profile.naics||[]).map(x=>String(x).trim()).filter(x=>/^\d{2,6}$/.test(x))).slice(0,8);
  const terms=unique((profile.capabilities||[]).flatMap(x=>String(x).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g)||[]).filter(x=>!STOP.has(x))).slice(0,3);
  const regions=(profile.regions||[]).map(x=>String(x).trim().toUpperCase());
  const states=regions.some(x=>['REMOTE','GLOBAL','NATIONWIDE','ANYWHERE'].includes(x))?[]:unique(regions.filter(x=>STATES.has(x))).slice(0,2);
  const bases=naics.length?naics.map(ncode=>({ncode})):terms.map(title=>({title}));
  // Preferred states get priority, but broad searches retain unrestricted eligibility/geography.
  const queries=[];
  for(const filter of bases){for(const state of states)queries.push({...filter,state,ptypes:['o','k','r','p']});queries.push({...filter,ptypes:['o','k','r','p']});}
  return {configured:Boolean(bases.length),mode:naics.length?'naics':terms.length?'capabilities':'unconfigured',queries};
}
export function discoveryError(code,status=503){return Object.assign(new Error(code),{code,status});}
export function actionable(item,now) {
  const type=String(item.type||'').toLowerCase().replace(/[^a-z]/g,'');
  return item.active!==false&&['solicitation','combinedsynopsissolicitation','sourcessought','presolicitation'].includes(type)&&(!item.deadline||(!Number.isNaN(Date.parse(item.deadline))&&Date.parse(item.deadline)>=now.getTime()));
}
export async function discoverOpportunities({profile,page,config=discoveryConfig(),now=new Date(),clock=Date.now}) {
  const plan=planDiscovery(profile);if(!plan.configured)throw discoveryError('discovery_profile_required',409);
  const start=clock(),deadline=start+config.maxElapsedMs;
  const summary={rawCandidates:0,uniqueCandidates:0,evaluated:0,relevant:0,strong:0,retained:0,apiRequests:0,pages:0,searchHorizonDays:0,syncedAt:now.toISOString(),cacheHits:0,cacheMisses:0,stale:false,horizonsAttempted:[],queryPlans:plan.queries.length,stopReason:'horizon_exhausted',mode:plan.mode};
  const budget={requests:0,maxRequests:config.maxRequests,deadline,clock};
  const candidates=new Map(),scored=[];const limit=Math.min(config.pageSize,config.maxRaw);
  let priorHorizon=0;
  try {
  outer:for(const horizon of HORIZONS){
    summary.searchHorizonDays=horizon;summary.horizonsAttempted.push(horizon);
    const from=new Date(now),to=new Date(now);from.setUTCDate(from.getUTCDate()-horizon+1);if(priorHorizon)to.setUTCDate(to.getUTCDate()-priorHorizon);
    const queues=plan.queries.map(query=>({query,offset:0,done:false}));
    // Round-robin pages avoid one NAICS monopolizing the entire request budget.
    while(queues.some(q=>!q.done))for(const q of queues){
      if(q.done)continue;
      if(clock()>=deadline){summary.stopReason='time_budget';break outer;}
      if(summary.rawCandidates+limit>config.maxRaw){summary.stopReason='candidate_budget';break outer;}
      if(summary.pages>=100){summary.stopReason='page_budget';break outer;}
      let result;
      try{result=await page({query:q.query,from,to,limit,offset:q.offset,budget});}
      catch(error){if(error.code==='discovery_request_budget'||error.code==='discovery_time_budget'){summary.stopReason=error.code==='discovery_request_budget'?'request_budget':'time_budget';break outer;}throw error;}
      summary.pages++;summary.rawCandidates+=result.rawCount??result.items.length;
      if(!result.items.length&&q.offset*limit<result.totalRecords)throw discoveryError('discovery_incomplete_page');
      summary[result.cache==='hit'||result.cache==='shared'?'cacheHits':'cacheMisses']++;
      summary.stale ||= result.cache==='stale-fallback';
      for(const item of result.items){
        if(!item.id||candidates.has(String(item.id)))continue;
        candidates.set(String(item.id),item);summary.uniqueCandidates++;summary.evaluated++;
        const match=scoreOpportunity(profile,item,now); // once per unique notice during this discovery
        if(!actionable(item,now)||match.blocked)continue;
        if(match.score>=55)summary.relevant++;if(match.score>=75)summary.strong++;
        scored.push({item,score:match.score});
      }
      if(summary.relevant>=config.targetRelevant&&summary.strong>=config.targetStrong){summary.stopReason='quality_target';break outer;}
      q.offset++;
      q.done=q.offset*limit>=result.totalRecords;
    }
    priorHorizon=horizon;
  }
  }catch(error){summary.apiRequests=budget.requests;summary.elapsedMs=Math.max(0,clock()-start);summary.stopReason='provider_error';error.discoverySummary=summary;throw error;}
  summary.apiRequests=budget.requests;
  if(!summary.pages)throw discoveryError('discovery_time_budget');
  scored.sort((a,b)=>b.score-a.score||String(a.item.id).localeCompare(String(b.item.id),'en'));
  const retained=[...scored.filter(x=>x.score>=55).slice(0,config.retainRelevant),...scored.filter(x=>x.score<55).slice(0,config.retainExploration)];
  summary.retained=retained.length;summary.elapsedMs=Math.max(0,clock()-start);
  return {items:retained.map(x=>x.item),summary};
}
