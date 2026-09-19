import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TenantJsonStore } from '../src/storage/tenant-json-store.js';
import { OpportunityService } from '../src/services/opportunities.js';

const profile={name:'ACME',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:['PR'],negativeKeywords:[]};
const base={id:'n1',title:'Cloud support',postedDate:'2026-09-10',deadline:'2026-10-01',description:'',descriptionUrl:'',type:'Solicitation',naics:['541512'],setAside:'Small Business',setAsideCode:'SBA',placeOfPerformance:{state:'PR',city:'San Juan',zip:'00901'},resourceLinks:['https://example.test/a'],requirements:[],active:true};

test('tracked opportunity records a material change once and can be acknowledged',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-changes-'));
  try {
    const store=new TenantJsonStore({root,tenantId:'tenant-change01',seedProfile:profile,seedOpportunities:[base]});
    await store.saveDecision('n1',{status:'pursue',note:'important',updatedAt:'2026-09-18T00:00:00Z'});
    const updated={...base,deadline:'2026-10-08',resourceLinks:['https://example.test/a','https://example.test/amendment-1']};
    const service=new OpportunityService({store,provider:async()=>[updated]});
    const first=await service.sync();
    assert.equal(first.materialChanges,1);
    let item=await service.get('n1');
    assert.equal(item.changeWatch.unreadCount,1);
    assert.equal(item.changeWatch.latest.changes.some(x=>x.field==='deadline'),true);
    const second=await service.sync();
    assert.equal(second.materialChanges,0);
    assert.equal((await service.changes('n1')).length,1);
    const ack=await service.acknowledgeChanges('n1');
    assert.equal(ack.acknowledged,1);
    item=await service.get('n1');
    assert.equal(item.changeWatch.unreadCount,0);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('tracked opportunities outside the recent discovery window are retained and refreshed by notice id',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-watch-retain-'));
  try {
    const store=new TenantJsonStore({root,tenantId:'tenant-change02',seedProfile:profile,seedOpportunities:[base]});
    await store.saveDecision('n1',{status:'reviewing',note:'',updatedAt:'2026-09-18T00:00:00Z'});
    let watchCalls=0;
    const watchProvider={get:async()=>{watchCalls++;return {item:{...base,title:'Cloud support — amended',deadline:'2026-10-05'},cache:'miss',fetchedAt:'2026-09-18T20:00:00Z'};}};
    const service=new OpportunityService({store,provider:async()=>[],watchProvider});
    const result=await service.sync();
    assert.equal(result.trackedRetained,1);
    assert.equal(result.watchRefreshes,1);
    assert.equal(watchCalls,1);
    const item=await service.get('n1');
    assert.equal(item.title,'Cloud support — amended');
    assert.equal(item.feedStatus,'tracked-refresh');
    assert.equal(item.changeWatch.unreadCount,1);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('untracked old opportunities still fall out of the rolling discovery feed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-watch-drop-'));
  try {
    const store=new TenantJsonStore({root,tenantId:'tenant-change03',seedProfile:profile,seedOpportunities:[base]});
    const service=new OpportunityService({store,provider:async()=>[]});
    const result=await service.sync();
    assert.equal(result.count,0);
    assert.equal((await service.list()).length,0);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('tracked enriched pursuit detects requirement-only amendment and quantifies fit impact',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-req-delta-'));
  try {
    const baselineReq={id:'old',text:'Offeror must provide three past performance examples.',mandatory:true,source:'SAM.gov description · n1',status:'unverified',origin:'sam-extracted'};
    const enriched={...base,descriptionUrl:'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=n1',description:'Offeror must provide three past performance examples.',enrichedAt:'2026-09-18T10:00:00Z',requirementSnapshot:[baselineReq],requirements:[baselineReq]};
    const profileWithBlocker={...profile,hardBlockers:['secret facility clearance']};
    const store=new TenantJsonStore({root,tenantId:'tenant-reqdelta1',seedProfile:profileWithBlocker,seedOpportunities:[enriched]});
    await store.saveDecision('n1',{status:'pursue',note:'active bid',updatedAt:'2026-09-18T00:00:00Z'});
    let detailCalls=0;
    const detailProvider={get:async()=>{detailCalls++;return {description:'Offeror must provide five past performance examples. Offeror must hold a Secret facility clearance.',cache:'refresh',fetchedAt:'2026-09-18T21:00:00Z'};}};
    const service=new OpportunityService({store,provider:async()=>[{...base,descriptionUrl:enriched.descriptionUrl}],detailProvider});
    const result=await service.sync();
    assert.equal(result.requirementChecks,1);
    assert.equal(result.requirementChanges,1);
    assert.equal(result.materialChanges,1);
    assert.equal(detailCalls,1);
    const item=await service.get('n1');
    assert.equal(item.changeWatch.unreadCount,1);
    assert.equal(item.changeWatch.latest.changes.length,0,'requirement-only changes do not invent metadata changes');
    assert.equal(item.changeWatch.latest.requirementDelta.summary.modified,1);
    assert.equal(item.changeWatch.latest.requirementDelta.summary.added,1);
    assert.equal(item.changeWatch.latest.requirementDelta.summary.blockers,1);
    assert.equal(item.changeWatch.latest.impact.blockedAfter,true);
    assert.equal(item.changeWatch.latest.impact.scoreAfter,0);
    assert.match(item.changeWatch.latest.requirementDelta.added[0].requirement.text,/secret facility clearance/i);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('first tracked description analysis establishes baseline without creating a false change alert',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-req-baseline-'));
  try {
    const initial={...base,descriptionUrl:'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=n1'};
    const store=new TenantJsonStore({root,tenantId:'tenant-reqbase1',seedProfile:{...profile,hardBlockers:[]},seedOpportunities:[initial]});
    await store.saveDecision('n1',{status:'reviewing',note:'',updatedAt:'2026-09-18T00:00:00Z'});
    const detailProvider={get:async()=>({description:'Offeror must submit a technical proposal.',cache:'miss',fetchedAt:'2026-09-18T21:00:00Z'})};
    const service=new OpportunityService({store,provider:async()=>[initial],detailProvider});
    const result=await service.sync();
    assert.equal(result.requirementChecks,1);
    assert.equal(result.requirementChanges,0);
    assert.equal(result.materialChanges,0);
    const item=await service.get('n1');
    assert.equal(item.changeWatch.unreadCount,0);
    assert.equal(item.requirementSnapshot.length,1);
  } finally { await rm(root,{recursive:true,force:true}); }
});
