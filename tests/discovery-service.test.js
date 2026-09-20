import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TenantJsonStore} from '../src/storage/tenant-json-store.js';
import {SqliteStorageManager} from '../src/storage/sqlite-storage.js';
import {OpportunityService} from '../src/services/opportunities.js';
import {runDaily} from '../src/ops/daily-run.js';
import {createProviders} from '../src/runtime/providers.js';
const profile={name:'Private company',naics:['541512'],capabilities:['cloud'],regions:[],setAsides:[]};
const provider=()=>Object.assign(async()=>assert.fail('generic provider called'),{discover:async p=>({items:[{id:p.naics[0],title:'Cloud',naics:p.naics,type:'Solicitation'}],summary:{evaluated:1,retained:1}})});
for(const driver of ['json','sqlite'])test(`discovery persists tenant-isolated summary and retains tracked history: ${driver}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'discovery-service-')),db=driver==='sqlite'?new SqliteStorageManager({path:join(root,'db.sqlite')}):null;
  try{
    const store=id=>db?db.tenantStore(id):new TenantJsonStore({root,tenantId:id});
    const a=store('tenant-alpha'),b=store('tenant-bravo');await a.saveProfile(profile);await b.saveProfile({...profile,naics:['541511']});
    await a.saveOpportunities([{id:'tracked-old',title:'Original',requirements:[{text:'Retain evidence',source:'Manual'}]},{id:'untracked-old',title:'Old discovery'}]);
    await a.saveDecision('tracked-old',{status:'reviewing'});
    await a.appendOpportunityChange('tracked-old',{id:'event-1',detectedAt:'2026-01-01',acknowledgedAt:'2026-02-01',changes:[]});
    let watches=0;const sa=new OpportunityService({store:a,provider:provider(),watchProvider:{get:async()=>{watches++;return {item:null};}}}),sb=new OpportunityService({store:b,provider:provider()});
    await Promise.all([sa.sync(),sb.sync()]);
    assert.deepEqual((await a.getOpportunities()).map(x=>x.id),['541512','tracked-old']);assert.deepEqual((await b.getOpportunities()).map(x=>x.id),['541511']);
    assert.equal(watches,1);assert.equal((await a.findOpportunity('tracked-old')).requirements[0].text,'Retain evidence');assert.equal((await a.getOpportunityChanges('tracked-old'))[0].acknowledgedAt,'2026-02-01');
    assert.equal((await sa.discoveryStatus()).summary.retained,2);assert.equal((await sb.discoveryStatus()).summary.retained,1);
    const before=await a.getOpportunities();sa.provider.discover=async()=>{throw new Error('upstream failure');};await assert.rejects(sa.sync());assert.deepEqual(await a.getOpportunities(),before);
    await a.saveProfile({...profile,naics:['541519']});assert.equal((await sa.discoveryStatus()).profileChanged,true);
  }finally{db?.close();await rm(root,{recursive:true,force:true});}
});
test('empty profile blocks service before any provider call',async()=>{
  const service=new OpportunityService({store:{getProfile:async()=>({})},provider:async()=>assert.fail('called')});await assert.rejects(service.sync(),{code:'discovery_profile_required'});
});
test('concurrent sync coalesces per store and changing criteria rejects stale-plan results',async()=>{
  let calls=0,changed=false;const store={getProfile:async()=>changed?{...profile,naics:['541511']}:profile,getOpportunities:async()=>[],saveOpportunities:async()=>assert.fail('stale profile saved')};
  const p=provider();p.discover=async()=>{calls++;await new Promise(r=>setTimeout(r,10));changed=true;return {items:[],summary:{}};};
  const a=new OpportunityService({store,provider:p}),b=new OpportunityService({store,provider:p});
  const results=await Promise.allSettled([a.sync(),b.sync()]);assert.equal(calls,1);assert.ok(results.every(x=>x.status==='rejected'&&x.reason.code==='discovery_profile_changed'));
});
test('daily job discovers independently per tenant while retaining outbox idempotency',async()=>{
  const root=await mkdtemp(join(tmpdir(),'discovery-daily-')),db=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try{
    for(const [email,naics] of [['a@example.test','541512'],['b@example.test','541511']]){const u=await db.accountStore.register({email,password:'local strong password 123'});const token=await db.accountStore.issueEmailVerification({email});await db.accountStore.verifyEmailToken(token.token);await db.tenantStore(u.tenantId).saveProfile({...profile,naics:[naics]});}
    const p=provider(),seen=[];const discover=p.discover;p.discover=async profile=>{seen.push(profile.naics[0]);return discover(profile);};
    const options={accountStore:db.accountStore,tenantStoreFor:(id,o)=>db.tenantStore(id,o),provider:p,outboxRoot:join(root,'outbox')};
    assert.equal((await runDaily(options)).queued,2);assert.deepEqual(seen.sort(),['541511','541512']);assert.equal((await runDaily(options)).alreadyQueued,2);
  }finally{db.close();await rm(root,{recursive:true,force:true});}
});
test('manual freshness persists across service instances and budget exhaustion preserves feed/summary',async t=>{
  const root=await mkdtemp(join(tmpdir(),'discovery-fresh-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new TenantJsonStore({root,tenantId:'tenant-fresh'});await store.saveProfile(profile);
  let calls=0,clock=Date.now();const {provider,watchProvider,detailProvider}=createProviders({dataRoot:root,env:{DATA_PROVIDER:'sam',SAM_API_KEY:'fake',SAM_DAILY_REQUEST_BUDGET:'3',DISCOVERY_TARGET_RELEVANT:'1',DISCOVERY_TARGET_STRONG:'1',DISCOVERY_FRESHNESS_MS:'1000',DISCOVERY_REQUEST_INTERVAL_MS:'0'},fetchImpl:async url=>{
    calls++;if(url.pathname.includes('description'))return{ok:true,status:200,text:async()=> 'Cloud requirement: provide a technical approach.'};
    const id=url.searchParams.get('noticeid')||'new-notice';return{ok:true,status:200,json:async()=>({totalRecords:1,opportunitiesData:[{noticeId:id,title:'Cloud',type:'o',naicsCode:'541512',responseDeadLine:'2099-01-01',...(id==='tracked-old'?{description:'https://api.sam.gov/description?id=tracked-old'}:{})}]})};
  }});
  provider.budget.log=()=>{};
  await store.saveOpportunities([{id:'tracked-old',title:'Old title',naics:['541512'],type:'Solicitation',requirements:[]}]);await store.saveDecision('tracked-old',{status:'reviewing'});
  const options={store,provider,watchProvider,detailProvider,now:()=>clock};const service=new OpportunityService(options);
  await service.sync();assert.equal(calls,3);const saved=await store.getDiscovery(),items=await store.getOpportunities();
  assert.equal((await new OpportunityService(options).sync()).reused,true);await service.list();await service.discoveryStatus();assert.equal(calls,3);assert.deepEqual((await store.getDiscovery()).summary,saved.summary);
  clock+=1001;await assert.rejects(service.sync(),{code:'discovery_global_budget_exhausted'});await assert.rejects(service.sync(),{code:'discovery_global_budget_exhausted'});
  assert.equal(calls,3);assert.deepEqual(await store.getOpportunities(),items);assert.deepEqual((await store.getDiscovery()).summary,saved.summary);assert.ok((await service.discoveryStatus()).refreshUnavailable);
  assert.deepEqual((await provider.budget.status()).byKind,{discovery:1,'tracked-notice':1,description:1});
});
test('budget denial during tracked refresh does not commit discovered feed or buffered history',async t=>{
  const root=await mkdtemp(join(tmpdir(),'discovery-preserve-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new TenantJsonStore({root,tenantId:'tenant-preserve'});await store.saveProfile(profile);await store.saveOpportunities([{id:'tracked-old',title:'Original',requirements:[]}]);await store.saveDecision('tracked-old',{status:'pursue'});
  const {provider,watchProvider}=createProviders({dataRoot:root,env:{DATA_PROVIDER:'sam',SAM_API_KEY:'fake',SAM_DAILY_REQUEST_BUDGET:'1',DISCOVERY_TARGET_RELEVANT:'1',DISCOVERY_TARGET_STRONG:'1'},fetchImpl:async()=>({ok:true,status:200,json:async()=>({totalRecords:1,opportunitiesData:[{noticeId:'new',title:'Cloud',type:'o',naicsCode:'541512',responseDeadLine:'2099-01-01'}]})})});provider.budget.log=()=>{};
  await assert.rejects(new OpportunityService({store,provider,watchProvider}).sync(),{code:'discovery_global_budget_exhausted'});
  assert.deepEqual((await store.getOpportunities()).map(x=>x.id),['tracked-old']);assert.equal((await store.getDiscovery()).summary,undefined);assert.deepEqual(await store.getOpportunityChanges('tracked-old'),[]);
});
test('scheduler distributes a shared credential budget rather than letting first tenant consume it',async t=>{
  const root=await mkdtemp(join(tmpdir(),'discovery-fair-daily-')),db=new SqliteStorageManager({path:join(root,'db.sqlite')});t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
  const tenants=[];for(const [i,naics] of ['541512','541511','541519'].entries()){
    const email=`fair-${i}@example.test`,u=await db.accountStore.register({email,password:'local scheduler test password 123'}),token=await db.accountStore.issueEmailVerification({email});await db.accountStore.verifyEmailToken(token.token);await db.tenantStore(u.tenantId).saveProfile({...profile,naics:[naics]});tenants.push(u.tenantId);
  }
  let calls=0;const providers=createProviders({dataRoot:root,env:{DATA_PROVIDER:'sam',SAM_API_KEY:'fake',SAM_DAILY_REQUEST_BUDGET:'6',SAM_OPPORTUNITY_PAGE_SIZE:'1',DISCOVERY_REQUEST_INTERVAL_MS:'0'},fetchImpl:async url=>{calls++;const code=url.searchParams.get('ncode'),offset=url.searchParams.get('offset');return{ok:true,status:200,json:async()=>({totalRecords:5,opportunitiesData:[{noticeId:code+'-'+offset,title:'Cloud',type:'o',naicsCode:code,responseDeadLine:'2099-01-01'}]})};}});providers.provider.budget.log=()=>{};
  const options={accountStore:db.accountStore,tenantStoreFor:(id,o)=>db.tenantStore(id,o),...providers,outboxRoot:join(root,'outbox')};
  const first=await runDaily(options);assert.equal(first.queued,3);assert.equal(calls,6);
  const summaries=[];for(const id of tenants){const summary=(await db.tenantStore(id).getDiscovery()).summary;assert.equal(summary.apiRequests,2);assert.equal(summary.evaluated,2);summaries.push(summary);}
  const repeat=await runDaily(options);assert.equal(repeat.alreadyQueued,3);assert.equal(calls,6);assert.ok(repeat.results.every(x=>x.discoveryUnavailable));
  for(const [i,id] of tenants.entries())assert.deepEqual((await db.tenantStore(id).getDiscovery()).summary,summaries[i]);
  assert.deepEqual((await providers.provider.budget.status()).bySource,{scheduler:6});
});
test('temporary accounting failure can recover after repair and bounded deferral',async t=>{
  const root=await mkdtemp(join(tmpdir(),'discovery-recover-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new TenantJsonStore({root,tenantId:'tenant-recover'});await store.saveProfile(profile);
  let broken=true,clock=Date.now();const p=provider();p.budget={status:async()=>{if(broken)throw Object.assign(new Error('unavailable'),{code:'discovery_budget_unavailable'});return{limit:null};}};
  const service=new OpportunityService({store,provider:p,now:()=>clock});await assert.rejects(service.sync(),{code:'discovery_budget_unavailable'});
  assert.equal(Date.parse((await store.getDiscovery()).refreshUnavailable.retryAt),clock+60000);
  broken=false;clock+=60001;await service.sync();assert.equal((await store.getDiscovery()).refreshUnavailable,undefined);
});
