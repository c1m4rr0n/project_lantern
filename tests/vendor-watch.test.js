import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TenantJsonStore } from '../src/storage/tenant-json-store.js';
import { VendorWatchService } from '../src/services/vendors.js';

function providerFor(recordsRef){return{
  async getSnapshot(){return{records:recordsRef.value,sourceDate:'2026-09-18',sourceFile:'SAM_Exclusions.csv',sha256:'abc',fetchedAt:'2026-09-18T12:00:00Z',cache:'hit',stale:false};},
  screenAgainstSnapshot(v,s){
    const hit=s.records.find(x=>x.uei===v.uei);
    return hit?{status:'excluded',matchType:'uei',confidence:'high',reason:'Exact UEI match found in active SAM.gov exclusions extract.',matches:[{name:hit.name,uei:hit.uei,samNumber:hit.samNumber}],source:{provider:'SAM.gov exclusions extract',sourceDate:s.sourceDate,sourceFile:s.sourceFile,sha256:s.sha256,fetchedAt:s.fetchedAt,cache:s.cache,stale:false}}:{status:'clear',matchType:null,confidence:'high',reason:'No match.',matches:[],source:{provider:'SAM.gov exclusions extract',sourceDate:s.sourceDate,sourceFile:s.sourceFile,sha256:s.sha256,fetchedAt:s.fetchedAt,cache:s.cache,stale:false}};
  }
};}

test('vendor watch establishes a clear baseline, alerts on later exclusion, and can acknowledge',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-vendor-watch-'));
  try{
    const store=new TenantJsonStore({root,tenantId:'tenant-vendor01'});const ref={value:[]};const service=new VendorWatchService({store,exclusionProvider:providerFor(ref)});
    const vendor=await service.add({legalName:'ACME Federal LLC',uei:'ABC123DEF456',cage:'1A2B3'});
    let run=await service.screenAll({now:new Date('2026-09-18T12:00:00Z')});
    assert.equal(run.screened,1);assert.equal(run.alerts,0);assert.equal((await service.get(vendor.id)).watch.unreadCount,0);
    ref.value=[{name:'ACME Federal LLC',uei:'ABC123DEF456',samNumber:'S-1'}];
    run=await service.screenAll({now:new Date('2026-09-19T12:00:00Z')});
    assert.equal(run.excluded,1);assert.equal(run.changed,1);assert.equal(run.alerts,1);
    let item=await service.get(vendor.id);assert.equal(item.watch.unreadCount,1);assert.equal(item.watch.latest.previousStatus,'clear');
    const ack=await service.acknowledge(vendor.id,{now:new Date('2026-09-19T13:00:00Z')});assert.equal(ack.acknowledged,1);
    item=await service.get(vendor.id);assert.equal(item.watch.unreadCount,0);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('vendor watch flags an initially excluded vendor immediately',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-vendor-risk-'));
  try{
    const store=new TenantJsonStore({root,tenantId:'tenant-vendor02'});const ref={value:[{name:'Risk Corp',uei:'RISK12345678',samNumber:'S-2'}]};const service=new VendorWatchService({store,exclusionProvider:providerFor(ref)});
    const vendor=await service.add({legalName:'Risk Corp',uei:'RISK12345678'});
    const result=await service.screenOne(vendor.id,{now:new Date('2026-09-18T12:00:00Z')});
    assert.equal(result.latestScreening.status,'excluded');assert.equal(result.watch.unreadCount,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
