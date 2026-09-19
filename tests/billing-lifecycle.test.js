import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { BillingService } from '../src/billing/service.js';
import { getPlan } from '../src/billing/plans.js';
test('pending checkout is serialized and expiry allows another attempt',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-checkout-'));const storage=createStorageManager({driver:'sqlite',dataRoot:root});
  const store=storage.tenantStore('tenant-12345678');let calls=0;
  const provider={name:'stripe',configured:()=>true,createCheckout:async()=>({id:'cs_'+(++calls),url:'https://checkout.example.test'})};
  const service=new BillingService({store,tenantId:'tenant-12345678',provider,publicBaseUrl:'https://example.test'});
  try{const results=await Promise.allSettled([service.checkout('starter'),service.checkout('starter')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);await service.applyStripeEvent({id:'expired',type:'checkout.session.expired',data:{object:{id:'cs_1',metadata:{tenant_id:'tenant-12345678'}}}});assert.equal((await store.getBilling()).checkoutPending,false);await service.checkout('starter');assert.equal(calls,2);}finally{storage.close();await rm(root,{recursive:true,force:true});}
});
test('subscription cancellation, stale replay, durable event IDs and new activation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-billing-lifecycle-'));const storage=createStorageManager({driver:'sqlite',dataRoot:root});
  const store=storage.tenantStore('tenant-12345678');const service=new BillingService({store,tenantId:'tenant-12345678'});
  const event=(id,type,created,status='active',sub='sub_1')=>({id,type,created,data:{object:{id:sub,status,metadata:{tenant_id:'tenant-12345678',plan_key:'team'},customer:'cus_1',cancel_at_period_end:false}}});
  try{
    assert.equal(getPlan('team').name,'Scale');assert.equal(getPlan('team').vendorLimit,500);
    await service.applyStripeEvent(event('first','customer.subscription.created',100));
    const scheduled=event('scheduled','customer.subscription.updated',101);scheduled.data.object.cancel_at_period_end=true;
    await service.applyStripeEvent(scheduled);assert.equal((await service.status()).entitlements.active,true);
    await service.applyStripeEvent(event('resumed','customer.subscription.updated',102));assert.equal((await service.status()).state.cancelAtPeriodEnd,false);
    await service.applyStripeEvent(event('deleted','customer.subscription.deleted',103,'canceled'));assert.equal((await service.status()).entitlements.active,false);
    assert.equal((await service.applyStripeEvent(event('old','customer.subscription.updated',101))).ignored,true);
    assert.equal((await service.applyStripeEvent(event('late','customer.subscription.updated',104))).ignored,true);
    for(let i=0;i<110;i++)await service.applyStripeEvent(event('ignored'+i,'unhandled',104));
    assert.equal((await service.applyStripeEvent(event('first','customer.subscription.created',100))).duplicate,true);
    await service.applyStripeEvent(event('new','customer.subscription.created',105,'active','sub_2'));assert.equal((await service.status()).entitlements.active,true);
    await service.applyStripeEvent(event('old-deletion-retry','customer.subscription.deleted',106,'canceled','sub_1'));assert.equal((await service.status()).entitlements.active,true);assert.equal((await service.status()).state.subscriptionId,'sub_2');
    assert.equal((await store.getAnalytics()).events.filter(x=>x.event==='subscription_activated').length,1);
  }finally{storage.close();await rm(root,{recursive:true,force:true});}
});
