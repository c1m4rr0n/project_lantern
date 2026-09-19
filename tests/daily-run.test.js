import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageManager } from '../src/storage/sqlite-storage.js';
import { runDaily } from '../src/ops/daily-run.js';

test('daily job fetches once, queues one digest per configured tenant, and is idempotent per day', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-daily-'));
  const storage=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try {
    const a=await storage.accountStore.register({email:'a@example.com',password:'strong pass 12345'});
    const verify=await storage.accountStore.issueEmailVerification({email:a.email});
    await storage.accountStore.verifyEmailToken(verify.token);
    await storage.accountStore.register({email:'b@example.com',password:'strong pass 54321'});
    await storage.tenantStore(a.tenantId).saveProfile({name:'Alpha',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:[],negativeKeywords:[]});
    let calls=0;
    const provider=async()=>{calls++;return [{id:'o1',title:'Cloud support',description:'cloud support',naics:['541512'],setAside:'',placeOfPerformance:{state:''},requirements:[],deadline:'2026-09-25'}];};
    const args={accountStore:storage.accountStore,tenantStoreFor:(id,o)=>storage.tenantStore(id,o),provider,outboxRoot:join(root,'outbox'),now:new Date('2026-09-18T12:00:00Z')};
    const first=await runDaily(args);
    const second=await runDaily(args);
    assert.equal(first.tenants,2);
    assert.equal(first.queued,1);
    assert.equal(first.skipped,1);
    assert.equal(second.queued,0);
    assert.equal(second.alreadyQueued,1);
    assert.equal(calls,2);
    assert.equal((await readdir(join(root,'outbox'))).length,1);
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});

test('daily job makes zero upstream calls when no verified configured tenant is eligible', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-daily-skip-'));
  const storage=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try {
    const user=await storage.accountStore.register({email:'unverified@example.com',password:'strong pass 12345'});
    await storage.tenantStore(user.tenantId).saveProfile({name:'Unverified',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:[],negativeKeywords:[]});
    let calls=0;
    const result=await runDaily({accountStore:storage.accountStore,tenantStoreFor:(id,o)=>storage.tenantStore(id,o),provider:async()=>{calls++;return[];},outboxRoot:join(root,'outbox')});
    assert.equal(calls,0);
    assert.equal(result.eligibleTenants,0);
    assert.equal(result.results[0].status,'skipped-unverified');
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});

test('daily job screens vendor-only tenant without fetching opportunity feed', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-daily-vendor-'));
  const storage=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try {
    const user=await storage.accountStore.register({email:'vendor@example.com',password:'strong pass vendor 123'});
    const verify=await storage.accountStore.issueEmailVerification({email:user.email});
    await storage.accountStore.verifyEmailToken(verify.token);
    await storage.tenantStore(user.tenantId).saveVendors([{id:'vendor-1',legalName:'Risk Vendor LLC',normalizedName:'RISK VENDOR LLC',uei:'RISK12345678',cage:'',notes:'',createdAt:'2026-09-18T00:00:00Z',updatedAt:'2026-09-18T00:00:00Z',latestScreening:null}]);
    let opportunityCalls=0, snapshotCalls=0;
    const exclusionProvider={
      async getSnapshot(){snapshotCalls++;return{records:[{name:'Risk Vendor LLC',uei:'RISK12345678',samNumber:'S-1'}],sourceDate:'2026-09-18',sourceFile:'ex.csv',sha256:'x',fetchedAt:'2026-09-18T12:00:00Z',cache:'hit',stale:false};},
      screenAgainstSnapshot(v,s){return{status:'excluded',matchType:'uei',confidence:'high',reason:'Exact UEI match.',matches:[{name:'Risk Vendor LLC',uei:'RISK12345678',samNumber:'S-1'}],source:{provider:'SAM.gov exclusions extract',sourceDate:s.sourceDate,sourceFile:s.sourceFile,sha256:s.sha256,fetchedAt:s.fetchedAt,cache:s.cache,stale:false}};}
    };
    const result=await runDaily({accountStore:storage.accountStore,tenantStoreFor:(id,o)=>storage.tenantStore(id,o),provider:async()=>{opportunityCalls++;return[];},exclusionProvider,outboxRoot:join(root,'outbox'),now:new Date('2026-09-18T12:00:00Z')});
    assert.equal(opportunityCalls,0);
    assert.equal(snapshotCalls,1);
    assert.equal(result.vendorEligibleTenants,1);
    assert.equal(result.opportunityEligibleTenants,0);
    assert.equal(result.results[0].vendorAlerts,1);
    assert.equal(result.queued,1);
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});


test('daily job skips tenants whose trial or subscription is inactive', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-daily-billing-'));
  const storage=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try {
    const user=await storage.accountStore.register({email:'expired@example.com',password:'strong pass billing 123'});
    const verify=await storage.accountStore.issueEmailVerification({email:user.email});
    await storage.accountStore.verifyEmailToken(verify.token);
    await storage.tenantStore(user.tenantId).saveVendors([{id:'vendor-1',legalName:'Vendor LLC',normalizedName:'VENDOR LLC',uei:'VEND12345678',cage:'',notes:'',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',latestScreening:null}]);
    let snapshotCalls=0;
    const result=await runDaily({accountStore:storage.accountStore,tenantStoreFor:(id,o)=>storage.tenantStore(id,o),provider:async()=>[],exclusionProvider:{async getSnapshot(){snapshotCalls++;return{records:[]};}},billingStatusFor:async()=>({entitlements:{active:false}}),outboxRoot:join(root,'outbox'),now:new Date('2026-09-18T12:00:00Z')});
    assert.equal(snapshotCalls,0);
    assert.equal(result.eligibleTenants,0);
    assert.equal(result.results[0].status,'skipped-billing');
  } finally { storage.close(); await rm(root,{recursive:true,force:true}); }
});
