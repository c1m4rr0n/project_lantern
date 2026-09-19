import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,mkdir,writeFile,readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { exportAccount,deleteAccount,resumeDeletions,assertDeletionBilling } from '../src/services/account-lifecycle.js';
import { track,analyticsSummary } from '../src/services/analytics.js';
import { withActivity,withMaintenance } from '../src/security/activity.js';
import { launchConfig,launchHtml } from '../src/runtime/launch.js';
for(const driver of ['sqlite','json'])test(`account export, deletion and analytics isolation ${driver}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-account-commercial-'));let storage=createStorageManager({driver,dataRoot:root});
  try{
    const user=await storage.accountStore.register({email:'owner@example.test',password:'long password 12345'});
    const other=await storage.accountStore.register({email:'other@example.test',password:'long password 54321'});
    const store=storage.tenantStore(user.tenantId);await store.saveVendors([{id:'v1',legalName:'Own vendor'}]);
    await storage.tenantStore(other.tenantId).saveVendors([{id:'v2',legalName:'Other private vendor'}]);
    await store.saveBilling({plan:'trial',status:'trialing',secret:'should-not-export',processedEvents:['internal']});
    await track(store,'registered',{once:true});await track(store,'registered',{once:true});
    await track(store,'return_activity');await track(store,'return_activity');
    assert.equal((await store.getAnalytics()).events.length,2);
    assert.equal((await analyticsSummary(storage)).uniqueAccountsReachingMilestone.registered,1);
    const exported=JSON.stringify(await exportAccount({user,store}));
    for(const forbidden of ['passwordHash','password_hash','sessionVersion','should-not-export','Other private vendor','processedEvents'])assert.ok(!exported.includes(forbidden));
    assert.ok(exported.includes('account.exported'));
    await assert.rejects(()=>deleteAccount({storage,dataRoot:root,user,store,confirmation:'wrong'}),/DELETE/);
    await mkdir(join(root,'outbox'),{recursive:true});
    await writeFile(join(root,'outbox','own.json'),JSON.stringify({to:user.email,payload:{link:'sensitive'}}));
    await writeFile(join(root,'outbox','other.json'),JSON.stringify({to:other.email}));
    await deleteAccount({storage,dataRoot:root,user,store,billing:{plan:'trial'},confirmation:'DELETE'});
    assert.equal(await storage.accountStore.getSessionIdentity(user.id),null);
    assert.deepEqual(await store.getVendors(),[]);assert.deepEqual(await store.getAuditEvents(),[]);
    assert.deepEqual(await readdir(join(root,'outbox')),['other.json']);
    const receipt=await readFile(join(root,'ops','deletions',user.tenantId+'.json'),'utf8');assert.ok(!receipt.includes(user.email));assert.ok(receipt.includes('account.deleted'));
    assert.equal((await storage.tenantStore(other.tenantId).getVendors()).length,1);
    storage.close();storage=createStorageManager({driver,dataRoot:root});assert.equal(await storage.accountStore.authenticate({email:user.email,password:'long password 12345'}),null);
  }finally{storage.close();await rm(root,{recursive:true,force:true});}
});
test('active, scheduled-cancel and unconfirmed billing block erasure',async()=>{
  await assert.rejects(()=>assertDeletionBilling({checkoutPending:true},{}),/pending/);
  await assert.rejects(()=>assertDeletionBilling({customerId:'cus_test'},{customerSubscriptions:async()=>[{status:'active'}]}),/Cancel all/);
  await assert.rejects(()=>assertDeletionBilling({subscriptionId:'sub_a',status:'active',cancelAtPeriodEnd:true},{}),/Cancel/);
  await assert.rejects(()=>assertDeletionBilling({subscriptionId:'sub_a',status:'canceled'},{retrieveSubscription:async()=>({id:'sub_a',status:'active'})}),/not confirmed/);
  await assert.rejects(()=>assertDeletionBilling({subscriptionId:'sub_a',status:'canceled'},{retrieveSubscription:async()=>{throw new Error('Offline');}}),/Offline/);
  await assertDeletionBilling({subscriptionId:'sub_a',status:'canceled'},{retrieveSubscription:async()=>({id:'sub_a',status:'canceled'})});
});
test('pending erasure resumes after process restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-delete-resume-'));const storage=createStorageManager({driver:'sqlite',dataRoot:root});
  try{const user=await storage.accountStore.register({email:'resume@example.test',password:'long password 12345'});await storage.tenantStore(user.tenantId).saveVendors([{id:'old'}]);const dir=join(root,'ops','deletions');await mkdir(dir,{recursive:true});await writeFile(join(dir,user.tenantId+'.json'),JSON.stringify({userId:user.id,tenantId:user.tenantId,email:user.email,requestedAt:new Date().toISOString(),status:'pending'}));await resumeDeletions({storage,dataRoot:root});assert.equal(await storage.accountStore.getSessionIdentity(user.id),null);assert.deepEqual(await storage.tenantStore(user.tenantId).getVendors(),[]);}finally{storage.close();await rm(root,{recursive:true,force:true});}
});
test('maintenance waits for in-flight work and blocks new work fairly',async()=>{
  const order=[];let release;
  const ongoing=withActivity(async()=>{order.push('start');await new Promise(r=>{release=r;});order.push('end');});
  await new Promise(r=>setImmediate(r));const deletion=withMaintenance(async()=>{order.push('delete');});const after=withActivity(async()=>{order.push('after');});release();await Promise.all([ongoing,deletion,after]);assert.deepEqual(order,['start','end','delete','after']);
});
test('launch defaults private and requires approved secure legal URLs',()=>{
  assert.equal(launchConfig({}).enabled,false);assert.throws(()=>launchConfig({PUBLIC_LAUNCH_ENABLED:'true'}));
  const html='<head><meta name="robots" content="noindex,nofollow"></head><body></body>';
  assert.equal(launchHtml(html,'/index.html',{enabled:false}),html);
  const config=launchConfig({PUBLIC_LAUNCH_ENABLED:'true',PUBLIC_BASE_URL:'https://example.test',APPROVED_PRIVACY_URL:'https://example.test/privacy',APPROVED_TERMS_URL:'https://example.test/terms',LEGAL_LINKS_APPROVED:'true'});
  assert.match(launchHtml(html,'/index.html',config),/canonical/);assert.equal(launchHtml(html,'/vendors.html',config),html);
});
