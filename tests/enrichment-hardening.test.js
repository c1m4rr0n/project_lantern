import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fetchSamDescription,SamDetailCache} from '../src/providers/sam-detail.js';
import {enrichmentError} from '../src/providers/enrichment-error.js';
import {OpportunityService} from '../src/services/opportunities.js';
import {TenantJsonStore} from '../src/storage/tenant-json-store.js';
const input={apiKey:'test-only-key',descriptionUrl:'https://api.sam.gov/desc/test',wait:async()=>{}};
const now=Date.parse('2026-09-21T00:00:00Z');

test('description status categories never return raw upstream bodies or retry permanent errors',async()=>{
  for(const [status,category,attempts] of [[429,'rate_limited',1],[401,'configuration',1],[403,'configuration',1],[404,'not_found',1],[410,'not_found',1],[400,'malformed',1],[500,'temporarily_unavailable',3],[503,'temporarily_unavailable',3]]){
    let calls=0;
    await assert.rejects(fetchSamDescription({...input,now:()=>now,fetchImpl:async()=>{calls++;return new Response('PRIVATE upstream body and key',{status,headers:{'retry-after':'120'}});}}),error=>{
      assert.equal(error.code,'enrichment_'+category);assert.equal(error.upstreamStatus,status);assert.doesNotMatch(JSON.stringify(error),/PRIVATE|test-only-key/);
      if(status===429)assert.equal(error.retryAt,'2026-09-21T00:02:00.000Z');return true;
    });assert.equal(calls,attempts);
  }
});

test('network retries are bounded and exponential; budget refusal is not retried',async()=>{
  const waits=[];let calls=0;
  assert.equal(await fetchSamDescription({...input,wait:async ms=>waits.push(ms),fetchImpl:async()=>{if(++calls<3)throw new Error('sensitive URL');return new Response('<p>Must submit pricing.</p>');}}),'Must submit pricing.');
  assert.deepEqual(waits,[500,1000]);
  calls=0;await assert.rejects(fetchSamDescription({...input,fetchImpl:async()=>{calls++;throw Object.assign(new Error('budget'),{code:'discovery_global_budget_exhausted'});}}),{code:'discovery_global_budget_exhausted'});assert.equal(calls,1);
});

test('description parser accepts text/HTML/JSON but rejects malformed or missing descriptions',async()=>{
  for(const body of ['<p>Must submit pricing.</p>',JSON.stringify({description:'<p>Must submit pricing.</p>'}),JSON.stringify({description:{body:'Must submit pricing.'}}),JSON.stringify('Must submit pricing.')])assert.equal(await fetchSamDescription({...input,fetchImpl:async()=>new Response(body)}),'Must submit pricing.');
  for(const body of ['{broken',JSON.stringify({error:'private diagnostic'}),'<title>Access denied</title>','x'.repeat(1_000_001)])await assert.rejects(fetchSamDescription({...input,fetchImpl:async()=>new Response(body)}),{code:'enrichment_malformed'});
  for(const body of ['', 'Description not found',JSON.stringify({message:'Description not found'})])await assert.rejects(fetchSamDescription({...input,fetchImpl:async()=>new Response(body)}),{code:'enrichment_not_found'});
  await assert.rejects(fetchSamDescription({...input,apiKey:''}),{code:'enrichment_configuration'});
});

test('429 cooldown honors HTTP-date across notices and force refresh; stale cache is explicit and bounded',async t=>{
  const root=await mkdtemp(join(tmpdir(),'rc21-detail-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let time=now,calls=0,fail=false;const logs=[];
  const cache=new SamDetailCache({root,apiKey:input.apiKey,now:()=>time,ttlMs:1,maxStaleMs:300_000,log:x=>logs.push(x),wait:async()=>{},fetchImpl:async()=>{calls++;return fail?new Response('PRIVATE',{status:429,headers:{'retry-after':'Mon, 21 Sep 2026 00:02:00 GMT'}}):new Response('Must submit pricing.');}});
  const request={id:'test',descriptionUrl:input.descriptionUrl};await cache.get(request);fail=true;time+=2;
  const stale=await cache.get(request);assert.equal(stale.cache,'stale-fallback');assert.equal(stale.upstreamError,'enrichment_rate_limited');
  await cache.get({...request,forceRefresh:true});assert.equal(calls,2);
  await assert.rejects(cache.get({...request,id:'other'}),{code:'enrichment_rate_limited'});assert.equal(calls,2);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|test-only-key|api.sam/);
  time=now+400_000;await assert.rejects(cache.get(request),{code:'enrichment_rate_limited'});assert.equal(calls,3);
});

test('broken description resolves once through same-notice metadata without replacing tenant evidence',async t=>{
  const root=await mkdtemp(join(tmpdir(),'rc21-enrich-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const original={id:'test',title:'Original',descriptionUrl:input.descriptionUrl,requirements:[{text:'Manual requirement',source:'Attachment',status:'done'}]};
  const store=new TenantJsonStore({root,tenantId:'tenant-enrich-test',seedProfile:{},seedOpportunities:[original]});
  let details=0,watches=0;
  const service=new OpportunityService({store,provider:async()=>[],detailProvider:{get:async req=>{details++;if(req.descriptionUrl===input.descriptionUrl)throw enrichmentError('not_found',404);return {description:'Background only.',cache:'miss',fetchedAt:new Date(now).toISOString()};}},watchProvider:{get:async req=>{watches++;assert.equal(req.forceRefresh,true);return {item:{id:'test',title:'Do not overwrite',descriptionUrl:'https://api.sam.gov/desc/new'},cache:'refresh'};}}});
  const result=await service.enrich('test');assert.equal(details,2);assert.equal(watches,1);assert.equal(result.title,'Original');assert.equal(result.requirements[0].text,'Manual requirement');assert.equal((await store.findOpportunity('test')).descriptionUrl,'https://api.sam.gov/desc/new');
});

test('permanent/transient enrichment failures preserve feed, history and tenant isolation',async t=>{
  const root=await mkdtemp(join(tmpdir(),'rc21-enrich-fail-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const original={id:'test',title:'Hardware',descriptionUrl:input.descriptionUrl,requirements:[{text:'Retained evidence'}]};
  const store=new TenantJsonStore({root,tenantId:'tenant-enrich-fail',seedProfile:{},seedOpportunities:[original]});
  for(const category of ['rate_limited','configuration','malformed','temporarily_unavailable','not_found']){
    let watches=0;
    const service=new OpportunityService({store,provider:async()=>[],detailProvider:{get:async()=>{throw enrichmentError(category);}},watchProvider:{get:async()=>{watches++;return {item:{id:'different',descriptionUrl:'https://api.sam.gov/desc/new'}};}}});
    await assert.rejects(service.enrich('test'),{code:'enrichment_'+category});assert.equal(watches,category==='not_found'?1:0);
    assert.deepEqual(await store.findOpportunity('test'),original);assert.equal((await service.list()).length,1);assert.deepEqual(await service.changes('test'),[]);assert.equal(await service.enrich('other-tenant-notice'),null);
  }
});

test('broken URL with a valid stale description attempts repair but keeps stale evidence on repair failure',async t=>{
  const root=await mkdtemp(join(tmpdir(),'rc21-stale-repair-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new TenantJsonStore({root,tenantId:'tenant-stale-repair',seedProfile:{},seedOpportunities:[{id:'test',title:'Hardware',descriptionUrl:input.descriptionUrl}]});
  let watches=0;
  const service=new OpportunityService({store,provider:async()=>[],detailProvider:{get:async()=>({description:'Must retain evidence.',cache:'stale-fallback',upstreamError:'enrichment_not_found',fetchedAt:new Date(now).toISOString()})},watchProvider:{get:async()=>{watches++;throw enrichmentError('temporarily_unavailable',503);}}});
  const result=await service.enrich('test');assert.equal(watches,1);assert.equal(result.enrichment.stale,true);assert.equal(result.description,'Must retain evidence.');assert.equal(result.descriptionUrl,input.descriptionUrl);
});
