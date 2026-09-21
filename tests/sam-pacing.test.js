import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SamRequestBudget} from '../src/ops/sam-request-budget.js';
import {SamDiscoveryPages} from '../src/providers/sam-discovery.js';
import {SamDetailCache} from '../src/providers/sam-detail.js';
import {OpportunityService} from '../src/services/opportunities.js';
import {TenantJsonStore} from '../src/storage/tenant-json-store.js';
import {enrichmentFailure} from '../public/enrichment-model.js';
import {enrichmentError} from '../src/providers/enrichment-error.js';

async function setup(t,options={}){
  const root=await mkdtemp(join(tmpdir(),'sam-pacing-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let time=Date.parse('2026-09-21');const waits=[],logs=[];
  const now=()=>time,wait=async ms=>{waits.push(ms);time+=ms;};
  const ledger=new SamRequestBudget({path:join(root,'ledger.json'),now,wait,log:x=>logs.push(x),...options});
  return {root,now,wait,waits,logs,ledger,advance:ms=>time+=ms};
}
const url='https://api.sam.gov/opportunities/v2/search';
const pageResponse=()=>new Response(JSON.stringify({totalRecords:8,opportunitiesData:[]}));
const request=(s,offset=0)=>({query:{ncode:'115310'},from:new Date('2026-08-21'),to:new Date('2026-09-21'),limit:500,offset,budget:{requests:0,maxRequests:20,clock:s.now,deadline:s.now()+120000}});

test('pacing defaults and clamps are conservative without operator configuration',async t=>{
  const s=await setup(t);assert.equal(s.ledger.quietMs,1500);
  for(const [value,expected] of [[undefined,1000],['',1000],['invalid',1000],[-1,0],[9000,5000],[0,0]])assert.equal(new SamDiscoveryPages({root:s.root,env:{DISCOVERY_REQUEST_INTERVAL_MS:value}}).gap,expected);
  for(const [quietMs,expected] of [[undefined,1500],['invalid',1500],[-1,0],[12000,10000],[0,0]])assert.equal(new SamRequestBudget({path:s.ledger.path,quietMs}).quietMs,expected);
});

test('eight concurrent pages stay serialized at 1000ms; cache/coalescing are free and immediate',async t=>{
  const s=await setup(t);const dispatches=[];let active=0,maxActive=0;
  const pages=new SamDiscoveryPages({root:join(s.root,'pages'),apiKey:'fixture',now:s.now,sleep:s.wait,fetchImpl:s.ledger.wrap(async()=>{active++;maxActive=Math.max(active,maxActive);dispatches.push(s.now());await Promise.resolve();active--;return pageResponse();},'discovery')});
  await Promise.all([...Array.from({length:8},(_,i)=>pages.get(request(s,i))),pages.get(request(s,0))]);
  assert.equal(maxActive,1);assert.deepEqual(dispatches.map(x=>x-dispatches[0]),[0,1000,2000,3000,4000,5000,6000,7000]);
  assert.equal((await s.ledger.status()).requests,8);assert.equal(s.waits.length,7);
  const cached=request(s);assert.equal((await pages.get(cached)).cache,'hit');assert.equal(cached.budget.requests,0);assert.equal(s.waits.length,7);assert.equal((await s.ledger.status()).requests,8);
});

test('retry backoff overlaps inter-page gap instead of adding fixed sleeps',async t=>{
  const s=await setup(t);const dispatches=[];
  const pages=new SamDiscoveryPages({root:s.root,apiKey:'fixture',now:s.now,sleep:s.wait,fetchImpl:async()=>{dispatches.push(s.now());return dispatches.length<3?new Response('',{status:503}):pageResponse();}});
  await pages.get(request(s));assert.deepEqual(dispatches.map(x=>x-dispatches[0]),[0,1000,2000]);assert.deepEqual(s.waits,[500,500,1000]);
});

test('manual description waits only the remaining quiet time, with no budget charge during sleep',async t=>{
  const s=await setup(t);let calls=0;
  await s.ledger.wrap(async()=>pageResponse(),'discovery')(url);s.advance(400);
  s.ledger.wait=async ms=>{assert.equal((await s.ledger.status()).requests,1);await s.wait(ms);};
  await s.ledger.wrap(async(_,options)=>{calls++;assert.equal(options.signal.aborted,false);assert.equal('samRequestTimeoutMs' in options,false);return new Response('Description');},'description')(url,{samRequestTimeoutMs:10000,signal:AbortSignal.abort()});
  assert.deepEqual(s.waits,[1100]);assert.equal(calls,1);assert.equal((await s.ledger.status()).requests,2);
  assert.deepEqual(s.logs.find(x=>x.event==='sam.upstream.pacing'),{event:'sam.upstream.pacing',kind:'description',source:'manual',waitedMs:1100,pacingReason:'post_discovery_quiet'});
  assert.doesNotMatch(JSON.stringify(s.logs),/api_key|api.sam.gov|fixture/);
  s.advance(2000);await s.ledger.wrap(async()=>new Response('Description'),'description')(url);assert.deepEqual(s.waits,[1100]);
});

test('fresh manual enrichment cache bypasses pacing and upstream while amendment force-refresh remains supported',async t=>{
  const s=await setup(t);let calls=0;
  const detailProvider=new SamDetailCache({root:join(s.root,'details'),apiKey:'fixture',now:s.now,wait:s.wait,log:()=>{},fetchImpl:s.ledger.wrap(async()=>{calls++;return new Response('Contractor must provide forestry support.');},'description')});
  const item={id:'notice',title:'Forestry',descriptionUrl:'https://api.sam.gov/desc/notice'};
  await detailProvider.get({id:item.id,descriptionUrl:item.descriptionUrl});
  await s.ledger.wrap(async()=>pageResponse(),'discovery')(url);
  const store=new TenantJsonStore({root:join(s.root,'tenant'),tenantId:'tenant-pacing-test',seedProfile:{},seedOpportunities:[item]});
  const service=new OpportunityService({store,provider:async()=>[],detailProvider});
  assert.equal((await service.enrich(item.id)).enrichment.cache,'hit');assert.equal(calls,1);assert.deepEqual(s.waits,[]);assert.equal((await s.ledger.status()).requests,2);
  await detailProvider.get({id:item.id,descriptionUrl:item.descriptionUrl,forceRefresh:true});assert.equal(calls,2);assert.deepEqual(s.waits,[1500]);
});

test('429 Retry-After remains authoritative after pacing; no immediate retries or extra request charges',async t=>{
  const s=await setup(t);let calls=0;
  await s.ledger.wrap(async()=>pageResponse(),'discovery')(url);
  const cache=new SamDetailCache({root:join(s.root,'details'),apiKey:'fixture',now:s.now,wait:s.wait,log:()=>{},fetchImpl:s.ledger.wrap(async()=>{calls++;return new Response('private upstream',{status:429,headers:{'retry-after':'60'}});},'description')});
  const input={id:'notice',descriptionUrl:'https://api.sam.gov/desc/notice'};
  await assert.rejects(cache.get(input),e=>{assert.equal(e.code,'enrichment_rate_limited');assert.equal(Date.parse(e.retryAt)-s.now(),60000);assert.match(enrichmentFailure(e),/limiting/);return true;});
  await assert.rejects(cache.get({...input,id:'other'}),{code:'enrichment_rate_limited'});
  assert.equal(calls,1);assert.deepEqual(s.waits,[1500]);assert.equal((await s.ledger.status()).requests,2);
  s.advance(60000);await assert.rejects(cache.get(input),{code:'enrichment_rate_limited'});assert.equal(calls,2);assert.deepEqual(s.waits,[1500]);
});

test('quiet time serializes simultaneous enrichment admissions and accounts failed attempts',async t=>{
  const s=await setup(t);const times=[];
  await assert.rejects(s.ledger.wrap(async()=>{throw new Error('network');},'discovery')(url));
  const fetch=s.ledger.wrap(async()=>{times.push(s.now());return new Response('Description');},'description');
  const start=s.now();await Promise.all([fetch(url),fetch(url)]);
  assert.deepEqual(times.map(x=>x-start),[1500,3000]);assert.equal((await s.ledger.status()).requests,3);
});

test('Retry-After learned during queued pacing is rechecked before spending quota',async t=>{
  const s=await setup(t);let calls=0;
  await s.ledger.wrap(async()=>pageResponse(),'discovery')(url);
  const cache=new SamDetailCache({root:join(s.root,'details'),apiKey:'fixture',now:s.now,wait:s.wait,log:()=>{},fetchImpl:s.ledger.wrap(async()=>{calls++;return new Response('Description');},'description')});
  s.ledger.wait=async ms=>{await s.wait(ms);cache.cooldown=enrichmentError('rate_limited',429,new Date(s.now()+60000).toISOString());};
  await assert.rejects(cache.get({id:'notice',descriptionUrl:'https://api.sam.gov/desc/notice'}),{code:'enrichment_rate_limited'});
  assert.equal(calls,0);assert.equal((await s.ledger.status()).requests,1);
});

test('zero quiet setting and scheduled descriptions do not add manual quiet delays',async t=>{
  for(const options of [{quietMs:0},{quietMs:1500}]){
    const s=await setup(t,options);await s.ledger.wrap(async()=>pageResponse(),'discovery')(url);
    await s.ledger.run({source:options.quietMs?'scheduler':'manual'},()=>s.ledger.wrap(async()=>new Response('Description'),'description')(url));
    assert.deepEqual(s.waits,[]);assert.equal((await s.ledger.status()).requests,2);
  }
});
