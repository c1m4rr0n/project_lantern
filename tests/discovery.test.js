import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverOpportunities,discoveryConfig,planDiscovery,discoveryError,capabilityTerms} from '../src/domain/discovery.js';
import {scoreOpportunity} from '../src/domain/scoring.js';
import {discoveryMessage,discoveryFailure} from '../public/discovery-model.js';
const now=new Date('2026-09-20T12:00:00Z');
const profile={naics:['541512'],capabilities:['cloud'],regions:[],setAsides:[]};
const item=id=>({id:String(id),title:'Cloud migration',naics:['541512'],type:'Solicitation',deadline:'2026-11-01',active:true});
const config=extras=>({...discoveryConfig(),...extras});
function fixture(records,seen=[],extras={}){return async args=>{
  if(args.budget.requests>=args.budget.maxRequests)throw discoveryError('discovery_request_budget');args.budget.requests++;seen.push(args);
  const all=typeof records==='function'?records(args):records;
  const items=all.slice(args.offset*args.limit,(args.offset+1)*args.limit);
  return {items,totalRecords:all.length,cache:'miss',...extras};
};}
test('planner preserves NAICS priority, deduplicates inputs and retains unrestricted searches',()=>{
  const p=planDiscovery({...profile,naics:['541512','541511','541512'],regions:['VA','VA'],setAsides:['Small Business']});
  assert.deepEqual(p.queries.map(x=>[x.ncode,x.state]),[['541512','VA'],['541512',undefined],['541511','VA'],['541511',undefined]]);
  assert.ok(p.queries.every(x=>!x.typeOfSetAside&&x.ptypes.join('')==='okrp'));
  assert.ok(planDiscovery({...profile,regions:['VA','Remote']}).queries.every(x=>!x.state));
});
test('capabilities-only planner uses at most three significant title terms, never a generic query',()=>{
  const p=planDiscovery({capabilities:['Cloud cloud support and cybersecurity engineering testing']});
  assert.equal(p.mode,'capabilities');assert.deepEqual(p.queries.map(x=>x.title),['cloud cybersecurity engineering testing']);
});
test('empty and unusable profiles reject discovery without provider calls',async()=>{
  for(const p of [{},{name:'Only name'},{capabilities:['services and support']}])await assert.rejects(discoverOpportunities({profile:p,page:()=>assert.fail('called')}),{code:'discovery_profile_required'});
});
test('single page, existing scoring and early quality stop',async()=>{
  const calls=[];const r=await discoverOpportunities({profile,now,page:fixture([item(1)],calls),config:config({targetRelevant:1,targetStrong:1})});
  assert.equal(calls.length,1);assert.equal(scoreOpportunity(profile,item(1),now).score,85);
  assert.equal(r.summary.strong,1);assert.equal(r.summary.stopReason,'quality_target');assert.equal(r.summary.searchHorizonDays,30);
});
test('multi-page offsets are page indexes and totalRecords terminates the query',async()=>{
  const calls=[];const records=Array.from({length:5},(_,i)=>item(i));
  const r=await discoverOpportunities({profile,now,page:fixture(a=>a.to.getUTCMonth()===8?records:[],calls),config:config({pageSize:2})});
  assert.deepEqual(calls.slice(0,3).map(x=>x.offset),[0,1,2]);assert.equal(calls[3].offset,0);assert.equal(r.summary.evaluated,5);assert.equal(calls.length,6);
});
test('exactly 1000/page stops without requesting a phantom next page',async()=>{
  const calls=[];const r=await discoverOpportunities({profile,now,page:fixture(Array.from({length:1000},(_,i)=>item(i)),calls),config:config({pageSize:1000})});
  assert.equal(calls.length,1);assert.equal(r.summary.rawCandidates,1000);assert.equal(r.summary.retained,500);
});
test('duplicates across pages, horizons and NAICS are evaluated once',async()=>{
  const r=await discoverOpportunities({profile:{...profile,naics:['541512','541511']},now,page:fixture([item(1),item(1),item(2)]),config:config({pageSize:2,maxRequests:50})});
  assert.equal(r.summary.rawCandidates,24);assert.equal(r.summary.uniqueCandidates,2);assert.equal(r.summary.evaluated,2);assert.equal(r.items.length,2);
});
test('adaptive horizons expand 30 -> 90 -> 180 -> 365 with non-overlapping calendar windows',async()=>{
  const calls=[];const r=await discoverOpportunities({profile,now,page:fixture([],calls)});
  assert.deepEqual(r.summary.horizonsAttempted,[30,90,180,365]);assert.equal(calls.length,4);
  assert.equal(calls[0].from.toISOString().slice(0,10),'2026-08-22');
  for(let i=1;i<calls.length;i++)assert.equal(calls[i-1].from-calls[i].to,86400000);
  assert.equal(calls[0].to-calls[3].from,364*86400000);
});
test('candidate cap includes duplicates and never over-fetches its bound',async()=>{
  const r=await discoverOpportunities({profile,now,page:fixture(Array.from({length:100},()=>item(1))),config:config({pageSize:10,maxRaw:25})});
  assert.equal(r.summary.rawCandidates,20);assert.equal(r.summary.stopReason,'candidate_budget');assert.equal(r.summary.evaluated,1);
});
test('global request cap bounds all NAICS and horizon pages',async()=>{
  const r=await discoverOpportunities({profile:{...profile,naics:['541512','541511']},now,page:fixture([]),config:config({maxRequests:3})});
  assert.equal(r.summary.apiRequests,3);assert.equal(r.summary.stopReason,'request_budget');
});
test('NAICS pages are round-robin, not first-query exhaustion',async()=>{
  const calls=[];await discoverOpportunities({profile:{...profile,naics:['541512','541511']},now,page:fixture([item(1),item(2)],calls),config:config({pageSize:1,maxRequests:4})});
  assert.deepEqual(calls.map(x=>[x.query.ncode,x.offset]),[['541512',0],['541511',0],['541512',1],['541511',1]]);
});
test('expired/invalid deadlines, awards, inactive and hard blocked records are not retained',async()=>{
  const records=[{...item(1),deadline:'2026-01-01'},{...item(2),deadline:'invalid'},{...item(3),type:'Award Notice'},{...item(4),active:false},{...item(5),title:'Cloud forbidden'}, {...item(6),deadline:null}];
  const r=await discoverOpportunities({profile:{...profile,hardBlockers:['forbidden']},now,page:fixture(records)});
  assert.equal(r.summary.evaluated,6);assert.deepEqual(r.items.map(x=>x.id),['6']);
});
test('retention keeps bounded relevant and exploration sets without arbitrary UI slicing',async()=>{
  const records=[item(1),item(2),item(3),{...item(4),naics:[],title:'Other'},{...item(5),naics:[],title:'Other'}];
  const r=await discoverOpportunities({profile,now,page:fixture(records),config:config({retainRelevant:2,retainExploration:1})});
  assert.deepEqual(r.items.map(x=>x.id),['1','2','4']);
});
test('provider failure and inconsistent empty page are not successful empty feeds',async()=>{
  await assert.rejects(discoverOpportunities({profile,now,page:async()=>{throw discoveryError('discovery_upstream_unavailable');}}),{code:'discovery_upstream_unavailable'});
  await assert.rejects(discoverOpportunities({profile,now,page:fixture([],[],{totalRecords:1})}),{code:'discovery_incomplete_page'});
});
test('configuration clamps NaN, negative, excessive and fractional values',()=>{
  const c=discoveryConfig({SAM_OPPORTUNITY_PAGE_SIZE:'2000',DISCOVERY_MAX_API_REQUESTS:'-1',DISCOVERY_MAX_RAW_CANDIDATES:'NaN',DISCOVERY_TARGET_STRONG:'2.9'});
  assert.equal(c.pageSize,1000);assert.equal(c.maxRequests,1);assert.equal(c.maxRaw,5000);assert.equal(c.targetStrong,2);
});
test('customer telemetry distinguishes incomplete, stale, empty and provider errors',()=>{
  assert.match(discoveryMessage({configured:false}),/Set up your company profile/);
  const text=discoveryMessage({configured:true,summary:{evaluated:1200,relevant:0,pages:3,stale:true,stopReason:'request_budget'}});
  assert.match(text,/1,200/);assert.match(text,/cached/);assert.match(text,/partial/);assert.match(text,/No profile matches/);
  assert.match(discoveryFailure(new Error('discovery_upstream_rejected')),/unchanged/);
});
test('capability-only discovery executes bounded title queries and locally scores results',async()=>{
  const calls=[];const result=await discoverOpportunities({profile:{capabilities:['cloud migration']},now,page:fixture([item(1)],calls)});
  assert.equal(result.summary.mode,'capabilities');assert.equal(calls.length,4);assert.ok(calls.every(x=>x.query.title==='cloud migration'&&!x.query.ncode));assert.equal(result.summary.evaluated,1);
});
for(const stop of [90,180,365])test(`adaptive expansion stops at ${stop} days when quality is reached`,async()=>{
  const calls=[],horizons=[30,90,180,365];
  const page=async args=>{calls.push(args);const horizon=horizons[calls.length-1];return{items:horizon===stop?[item(1)]:[],totalRecords:horizon===stop?1:0};};
  const result=await discoverOpportunities({profile,now,page,config:config({targetRelevant:1,targetStrong:1})});
  assert.equal(result.summary.searchHorizonDays,stop);assert.equal(result.summary.stopReason,'quality_target');assert.equal(calls.length,horizons.indexOf(stop)+1);
});
test('elapsed-time cap stops further pages and marks partial coverage',async()=>{
  let time=0;const result=await discoverOpportunities({profile,now,clock:()=>time,config:config({maxElapsedMs:1000}),page:async()=>{time=1001;return{items:[item(1)],totalRecords:1000};}});
  assert.equal(result.summary.pages,1);assert.equal(result.summary.stopReason,'time_budget');
});
test('generic IT services cannot trigger discovery; meaningful normalized phrases are preferred',()=>{
  assert.deepEqual(capabilityTerms(['IT services','Information technology consulting']),[]);
  assert.equal(planDiscovery({capabilities:['IT services']}).configured,false);
  assert.deepEqual(capabilityTerms(['  Cloud   SECURITY Consulting ','cloud-security services','SECURITY cloud','bridge inspection','cyber incident response','extra capability']),['cloud security','bridge inspection','cyber incident response']);
});
