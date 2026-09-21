import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SamRequestBudget,dailyRequestBudget} from '../src/ops/sam-request-budget.js';
import {SamDiscoveryPages} from '../src/providers/sam-discovery.js';
const url='https://api.sam.gov/opportunities/v2/search';
const response=()=>({ok:true,status:200,json:async()=>({totalRecords:0,opportunitiesData:[]})});
async function ledger(t,options={}){const root=await mkdtemp(join(tmpdir(),'sam-budget-'));t.after(()=>rm(root,{recursive:true,force:true}));return new SamRequestBudget({path:join(root,'budget.json'),log:()=>{},...options});}
test('unset/invalid daily budget is unknown, not a fabricated SAM allowance',async t=>{
  for(const input of [undefined,'','0','-1','3.5','NaN','Infinity','100k',true,'9007199254740992'])assert.equal(dailyRequestBudget(input),null);
  assert.equal(dailyRequestBudget(' 123 '),123);
  const l=await ledger(t);await l.consume('discovery');assert.equal((await l.status()).limit,null);assert.equal((await l.status()).remaining,null);assert.equal((await l.status()).requests,1);
});
test('concurrent requests cannot overspend a shared budget and restarts cannot reset usage',async t=>{
  const l=await ledger(t,{limit:2});let sent=0;const request=l.wrap(async()=>{sent++;return response();},'discovery');
  const results=await Promise.allSettled(Array.from({length:12},()=>request(url)));
  assert.equal(sent,2);assert.equal(results.filter(x=>x.status==='rejected').length,10);assert.equal((await l.status()).requests,2);
  const restarted=new SamRequestBudget({path:l.path,limit:2,log:()=>{}});await assert.rejects(restarted.consume('tracked-notice'),{code:'discovery_global_budget_exhausted'});
});
test('UTC window rollover permits calls, clock reversal fails closed',async t=>{
  let now=Date.parse('2026-09-20T23:59:59Z');const l=await ledger(t,{limit:1,now:()=>now});await l.consume('discovery');
  await assert.rejects(l.consume('description'),{code:'discovery_global_budget_exhausted'});now+=2000;await l.consume('description');assert.equal((await l.status()).requests,1);assert.equal((await l.status()).window,'2026-09-21');
  now-=86400000;await assert.rejects(l.consume('description'),{code:'discovery_budget_unavailable'});
});
test('fair grants reserve other tenants slots against early tenants and manual requests',async t=>{
  const l=await ledger(t,{limit:6});const grants=await l.reserveScheduled(['tenant-c','tenant-a','tenant-b']);assert.deepEqual([...grants.values()].map(x=>x.remaining),[2,2,2]);
  const a=grants.get('tenant-a');await l.run({source:'scheduler',lease:a},async()=>{await l.consume('discovery');await l.consume('tracked-notice');await assert.rejects(l.consume('discovery'),{code:'discovery_scheduled_share_exhausted'});});
  await assert.rejects(l.consume('description'),{code:'discovery_budget_reserved'});
  await l.run({source:'scheduler',lease:grants.get('tenant-b')},()=>l.consume('discovery'));
  assert.equal(grants.get('tenant-c').remaining,2);for(const grant of grants.values())await l.release(grant);
  await l.consume('description');assert.equal((await l.status()).requests,4);
});
test('small-budget remainder rotates between tenants across days',async t=>{
  let now=Date.parse('2026-09-20');const l=await ledger(t,{limit:1,now:()=>now});
  const a=await l.reserveScheduled(['a','b','c']);const first=[...a].find(([,v])=>v.remaining===1)[0];for(const grant of a.values())await l.release(grant);
  now+=86400000;const b=await l.reserveScheduled(['a','b','c']);assert.notEqual([...b].find(([,v])=>v.remaining===1)[0],first);
});
test('cached discovery is free; retries and manual/scheduler/tracked calls are counted without secrets',async t=>{
  const logs=[],l=await ledger(t,{limit:10,log:x=>logs.push(x)});let calls=0;
  const root=join(l.path,'..','pages');const pages=new SamDiscoveryPages({root,apiKey:'fake-private-key',env:{DISCOVERY_REQUEST_INTERVAL_MS:0},sleep:async()=>{},fetchImpl:l.wrap(async()=>++calls===1?{ok:false,status:503}:response(),'discovery')});
  const args=()=>({query:{title:'private profile phrase'},from:new Date('2026-09-01'),to:new Date('2026-09-20'),limit:500,offset:0,budget:{requests:0,maxRequests:20,clock:Date.now,deadline:Date.now()+100000}});
  await pages.get(args());await l.run({source:'scheduler'},()=>pages.get(args()));assert.equal(calls,2);
  await l.run({source:'scheduler'},()=>l.wrap(async()=>response(),'tracked-notice')(url));
  const state=await l.status();assert.equal(state.requests,3);assert.deepEqual(state.byKind,{discovery:2,'tracked-notice':1});assert.deepEqual(state.bySource,{manual:2,scheduler:1});
  assert.doesNotMatch(JSON.stringify(logs)+await readFile(l.path,'utf8'),/fake-private|private profile|api_key|tenant/);
});
test('budget denial is never retried or converted to stale page fallback',async t=>{
  const l=await ledger(t,{limit:1});let now=Date.now(),calls=0;
  const pages=new SamDiscoveryPages({root:join(l.path,'..','pages'),apiKey:'fake',now:()=>now,env:{OPPORTUNITY_CACHE_TTL_MS:1000},fetchImpl:l.wrap(async()=>{calls++;return response();},'discovery')});
  const args=()=>({query:{ncode:'541512'},from:new Date('2026-09-01'),to:new Date('2026-09-20'),limit:500,offset:0,budget:{requests:0,maxRequests:20,clock:Date.now,deadline:Date.now()+100000}});
  await pages.get(args());now+=2000;await assert.rejects(pages.get(args()),{code:'discovery_global_budget_exhausted'});assert.equal(calls,1);
});
test('redirect hops to SAM count individually; non-SAM download does not spend API allowance',async t=>{
  const l=await ledger(t,{limit:3});let calls=0;
  const request=l.wrap(async()=>{calls++;return calls===1?{status:302,headers:new Headers({location:url+'?hop=2'})}:calls===2?{status:302,headers:new Headers({location:'https://example.test/file.zip'})}:response();},'exclusions');
  await request(url);assert.equal(calls,3);assert.equal((await l.status()).requests,2);
});
test('corrupt operational ledger cannot silently restore allowance',async t=>{
  const l=await ledger(t,{limit:5});await writeFile(l.path,'not json');await assert.rejects(l.consume('discovery'),{code:'discovery_budget_unavailable'});
});
