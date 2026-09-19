import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BillingGateError, createBillingService } from '../src/billing/service.js';
import { MockBillingProvider, StripeBillingProvider, verifyStripeSignature } from '../src/billing/stripe.js';

function memoryStore(initial=null){let state=initial,events=[];return{async getAuditEvents(){return events;},async saveAuditEvents(next){events=next;},async getBilling(){return state?structuredClone(state):null;},async saveBilling(next){state=structuredClone(next);return next;},snapshot(){return state;}};}

test('new account gets a 14-day trial with a 25-vendor limit',async()=>{
  const store=memoryStore();
  const service=createBillingService({store,tenantId:'tenant-12345678',email:'a@example.com',accountCreatedAt:'2026-09-01T00:00:00Z',publicBaseUrl:'https://example.com',provider:new MockBillingProvider(),env:{}});
  const status=await service.status({now:new Date('2026-09-10T00:00:00Z')});
  assert.equal(status.state.plan,'trial');
  assert.equal(status.state.status,'trialing');
  assert.equal(status.entitlements.active,true);
  assert.equal(status.entitlements.vendorLimit,25);
  assert.equal(status.entitlements.trialDaysRemaining,5);
});

test('expired trial becomes read-only and blocks screening',async()=>{
  const store=memoryStore();
  const service=createBillingService({store,tenantId:'tenant-12345678',accountCreatedAt:'2026-09-01T00:00:00Z',publicBaseUrl:'https://example.com',provider:new MockBillingProvider(),env:{}});
  const status=await service.status({now:new Date('2026-09-20T00:00:00Z')});
  assert.equal(status.state.status,'expired');
  assert.equal(status.entitlements.active,false);
  await assert.rejects(()=>service.assertActiveAccess({now:new Date('2026-09-20T00:00:00Z')}),error=>error instanceof BillingGateError&&error.code==='subscription_required');
  await assert.rejects(()=>service.assertScreeningAllowed({now:new Date('2026-09-20T00:00:00Z')}),error=>error instanceof BillingGateError&&error.code==='subscription_required');
});

test('vendor limit is enforced server-side',async()=>{
  const store=memoryStore();
  const service=createBillingService({store,tenantId:'tenant-12345678',accountCreatedAt:'2026-09-01T00:00:00Z',publicBaseUrl:'https://example.com',provider:new MockBillingProvider(),env:{}});
  await assert.rejects(()=>service.assertVendorCapacity(25,{now:new Date('2026-09-05T00:00:00Z')}),error=>error instanceof BillingGateError&&error.code==='vendor_limit_reached');
  const ok=await service.assertVendorCapacity(24,{now:new Date('2026-09-05T00:00:00Z')});
  assert.equal(ok.entitlements.vendorLimit,25);
});

test('stripe subscription webhook activates plan and is idempotent',async()=>{
  const env={STRIPE_PRICE_STARTER:'price_start',STRIPE_PRICE_TEAM:'price_team'};
  const provider=new StripeBillingProvider({env:{...env,STRIPE_SECRET_KEY:'sk_test_x',STRIPE_WEBHOOK_SECRET:'whsec_x'},fetchFn:async()=>{throw new Error('not used');}});
  const store=memoryStore();
  const service=createBillingService({store,tenantId:'tenant-12345678',accountCreatedAt:'2026-09-01T00:00:00Z',publicBaseUrl:'https://example.com',provider,env});
  const event={id:'evt_1',type:'customer.subscription.updated',data:{object:{id:'sub_1',customer:'cus_1',status:'active',current_period_end:1790000000,cancel_at_period_end:false,metadata:{tenant_id:'tenant-12345678',plan_key:'starter'},items:{data:[{price:{id:'price_start'}}]}}}};
  const first=await service.applyStripeEvent(event,{now:new Date('2026-09-18T00:00:00Z')});
  const second=await service.applyStripeEvent(event,{now:new Date('2026-09-18T00:01:00Z')});
  assert.equal(first.duplicate,false);
  assert.equal(second.duplicate,true);
  const status=await service.status({now:new Date('2026-09-18T00:01:00Z')});
  assert.equal(status.state.plan,'starter');
  assert.equal(status.state.status,'active');
  assert.equal(status.state.customerId,'cus_1');
  assert.equal(status.entitlements.vendorLimit,50);
});

test('manual Stripe webhook signature verification rejects replay and accepts valid payload',()=>{
  const payload=JSON.stringify({id:'evt_sig',type:'ping',data:{object:{}}});
  const secret='whsec_test_secret';
  const ts=1789689600;
  const sig=createHmac('sha256',secret).update(`${ts}.${payload}`).digest('hex');
  const event=verifyStripeSignature(payload,`t=${ts},v1=${sig}`,secret,{now:new Date(ts*1000),toleranceSeconds:300});
  assert.equal(event.id,'evt_sig');
  assert.throws(()=>verifyStripeSignature(payload,`t=${ts-1000},v1=${sig}`,secret,{now:new Date(ts*1000),toleranceSeconds:300}),/stale stripe signature/);
});

test('Stripe checkout uses hosted subscription checkout with tenant metadata',async()=>{
  let request=null;
  const provider=new StripeBillingProvider({env:{STRIPE_SECRET_KEY:'sk_test_x',STRIPE_WEBHOOK_SECRET:'whsec_x',STRIPE_PRICE_STARTER:'price_start',STRIPE_PRICE_TEAM:'price_team'},fetchFn:async(url,options)=>{request={url,options};return{ok:true,status:200,async text(){return JSON.stringify({id:'cs_1',url:'https://checkout.stripe.test/cs_1'});}};}});
  const result=await provider.createCheckout({tenantId:'tenant-12345678',email:'a@example.com',planKey:'starter',successUrl:'https://app.example.com/vendors.html?billing=success',cancelUrl:'https://app.example.com/pricing.html?billing=cancel'});
  assert.equal(result.url,'https://checkout.stripe.test/cs_1');
  const body=new URLSearchParams(request.options.body);
  assert.equal(body.get('mode'),'subscription');
  assert.equal(body.get('line_items[0][price]'),'price_start');
  assert.equal(body.get('metadata[tenant_id]'),'tenant-12345678');
  assert.equal(body.get('subscription_data[metadata][plan_key]'),'starter');
  assert.equal(body.get('customer_email'),'a@example.com');
});
