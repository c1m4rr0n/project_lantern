import { getPlan, publicPlans, TRIAL_DAYS } from './plans.js';
import { audit, withTenantLock } from '../security/events.js';
import { track } from '../services/analytics.js';

const ACTIVE_STATUSES=new Set(['active','trialing']);
const nowIso=now=>(now instanceof Date?now:new Date(now)).toISOString();
const secondsIso=value=>Number(value)>0?new Date(Number(value)*1000).toISOString():null;

export class BillingGateError extends Error {
  constructor(code, message, status=402) { super(message); this.name='BillingGateError'; this.code=code; this.status=status; }
}

function baseline({accountCreatedAt, now}) {
  const started=new Date(accountCreatedAt || now);
  const validStart=Number.isFinite(started.getTime())?started:new Date(now);
  const ends=new Date(validStart.getTime()+TRIAL_DAYS*86400000);
  return {
    version:1,
    provider:'internal',
    plan:'trial',
    status:ends>now?'trialing':'expired',
    trialStartedAt:validStart.toISOString(),
    trialEndsAt:ends.toISOString(),
    customerId:null,
    subscriptionId:null,
    currentPeriodEnd:null,
    cancelAtPeriodEnd:false,
    processedEvents:[],
    updatedAt:nowIso(now)
  };
}

function normalizeState(state,{accountCreatedAt,now}) {
  const base=baseline({accountCreatedAt,now});
  const next={...base,...(state||{})};
  next.processedEvents=Array.isArray(next.processedEvents)?next.processedEvents:[];
  if(next.plan==='trial'&&!['canceled','incomplete_expired'].includes(next.status)) next.status=new Date(next.trialEndsAt)>now?'trialing':'expired';
  return next;
}

function entitlements(state, now) {
  const plan=getPlan(state.plan)||getPlan('trial');
  const active=state.plan==='trial'
    ? (state.status==='trialing' && new Date(state.trialEndsAt)>now)
    : ACTIVE_STATUSES.has(state.status);
  const trialDaysRemaining=state.plan==='trial'&&state.trialEndsAt
    ? Math.max(0,Math.ceil((new Date(state.trialEndsAt)-now)/86400000))
    : null;
  return {
    active,
    canScreen:active,
    canAddVendor:active,
    vendorLimit:plan.vendorLimit,
    trialDaysRemaining,
    readOnly:!active
  };
}

function tenantIdFromEvent(event) {
  const object=event?.data?.object||{};
  return String(object?.metadata?.tenant_id || object?.client_reference_id || '').trim() || null;
}

function planKeyFromSubscription(object, provider) {
  const metadataPlan=String(object?.metadata?.plan_key || '').trim();
  if(getPlan(metadataPlan) && metadataPlan!=='trial') return metadataPlan;
  const priceId=object?.items?.data?.[0]?.price?.id || object?.plan?.id || null;
  return provider?.planKeyFromPriceId?.(priceId) || null;
}

export class BillingService {
  constructor({ store, tenantId, email = '', accountCreatedAt = null, publicBaseUrl, provider, env = process.env }) {
    this.store=store;
    this.tenantId=String(tenantId||'');
    this.email=String(email||'');
    this.accountCreatedAt=accountCreatedAt;
    this.publicBaseUrl=String(publicBaseUrl||'').replace(/\/$/,'');
    this.provider=provider;
    this.env=env;
    const apply=this.applyStripeEvent.bind(this);
    this.applyStripeEvent=(...args)=>withTenantLock(`billing:${this.tenantId}`,()=>apply(...args));
    const checkout=this.checkout.bind(this);
    this.checkout=(...args)=>withTenantLock(`billing:${this.tenantId}`,()=>checkout(...args));
  }

  async state({now=new Date(),persist=false}={}) {
    const existing=await this.store.getBilling?.();
    const normalized=normalizeState(existing,{accountCreatedAt:this.accountCreatedAt,now});
    if(persist && (!existing || JSON.stringify(existing)!==JSON.stringify(normalized))) await this.store.saveBilling(normalized);
    return normalized;
  }

  async status({now=new Date()}={}) {
    const state=await this.state({now});
    return {
      provider:this.provider?.name||'mock',
      state:{...state,processedEvents:undefined},
      entitlements:entitlements(state,now),
      plans:publicPlans(this.env)
    };
  }

  async assertActiveAccess({now=new Date()}={}) {
    const result=await this.status({now});
    if(!result.entitlements.active) throw new BillingGateError('subscription_required','Your trial or subscription is not active. Upgrade to resume active monitoring.');
    return result;
  }

  async assertScreeningAllowed({now=new Date()}={}) {
    return this.assertActiveAccess({now});
  }

  async assertVendorCapacity(currentCount,{now=new Date()}={}) {
    const result=await this.assertActiveAccess({now});
    if(Number(currentCount)>=Number(result.entitlements.vendorLimit)) throw new BillingGateError('vendor_limit_reached',`Your ${result.state.plan} plan allows up to ${result.entitlements.vendorLimit} watched vendors.`);
    return result;
  }

  async checkout(planKey,{now=new Date()}={}) {
    if(!getPlan(planKey) || planKey==='trial') throw new BillingGateError('invalid_plan','Choose a paid plan.',400);
    if(this.provider?.name!=='stripe' || !this.provider.configured?.()) throw new BillingGateError('billing_unavailable','Live billing is not connected yet.',503);
    const state=await this.state({now});
    if(state.checkoutPending)throw new BillingGateError('checkout_pending','A checkout is pending. Complete it or contact support to reconcile it before starting another.',409);
    if(state.subscriptionId&&!['canceled','incomplete_expired'].includes(state.status))throw new BillingGateError('manage_existing_subscription','Use Manage billing to change or cancel your existing subscription.',409);
    state.checkoutPending=true;await this.store.saveBilling(state);
    const checkout=await this.provider.createCheckout({
      tenantId:this.tenantId,
      email:this.email,
      planKey,
      customerId:state.customerId,
      successUrl:`${this.publicBaseUrl}/vendors.html?billing=success`,
      cancelUrl:`${this.publicBaseUrl}/pricing.html?billing=cancel`
    });
    state.checkoutSessionId=checkout.id;await this.store.saveBilling(state);
    await track(this.store,'checkout_started');return checkout;
  }

  async portal({now=new Date()}={}) {
    if(this.provider?.name!=='stripe' || !this.provider.configured?.()) throw new BillingGateError('billing_unavailable','Live billing is not connected yet.',503);
    const state=await this.state({now});
    if(!state.customerId) throw new BillingGateError('billing_customer_missing','No billing customer exists for this account.',409);
    return this.provider.createPortal({customerId:state.customerId,returnUrl:`${this.publicBaseUrl}/vendors.html`});
  }

  async applyStripeEvent(event,{now=new Date()}={}) {
    const eventId=String(event?.id||'');
    if(!eventId) throw new Error('stripe event id is required');
    const eventTenant=tenantIdFromEvent(event);
    if(eventTenant && eventTenant!==this.tenantId) throw new Error('stripe tenant mismatch');
    let state=await this.state({now});
    const before=JSON.stringify([state.plan,state.status,state.cancelAtPeriodEnd]);
    if(state.processedEvents.includes(eventId)) return {ok:true,duplicate:true,state};
    const object=event?.data?.object||{};
    const type=String(event?.type||'');
    const eventTime=Number(event.created)||0;
    const stale=eventTime && state.lastSubscriptionEventAt && eventTime<state.lastSubscriptionEventAt;
    const terminalUpdate=(state.terminatedSubscriptions||[]).includes(object.id)&&type!=='customer.subscription.deleted';
    const otherSubscription=state.subscriptionId&&object.id!==state.subscriptionId&&type!=='customer.subscription.created';
    if(type.startsWith('customer.subscription.')&&(stale||terminalUpdate||otherSubscription)){
      state.processedEvents.push(eventId);await this.store.saveBilling(state);return {ok:true,ignored:true,state};
    }

    if(type==='checkout.session.expired'&&object.id===state.checkoutSessionId){
      state.checkoutPending=false;
    } else if(type==='checkout.session.completed') {
      state.checkoutPending=false;
      const planKey=String(object?.metadata?.plan_key||'');
      if(getPlan(planKey)&&planKey!=='trial') state.plan=planKey;
      if(object.customer) state.customerId=String(object.customer);
      if(object.subscription) state.subscriptionId=String(object.subscription);
      state.provider='stripe';
    } else if(type==='customer.subscription.created'||type==='customer.subscription.updated'||type==='customer.subscription.deleted') {
      state.checkoutPending=false;
      const planKey=planKeyFromSubscription(object,this.provider);
      if(planKey) state.plan=planKey;
      if(object.customer) state.customerId=String(object.customer);
      if(object.id) state.subscriptionId=String(object.id);
      state.provider='stripe';
      state.status=type==='customer.subscription.deleted'?'canceled':String(object.status||state.status||'inactive');
      state.currentPeriodEnd=secondsIso(object.current_period_end || object.items?.data?.[0]?.current_period_end) || state.currentPeriodEnd;
      state.cancelAtPeriodEnd=Boolean(object.cancel_at_period_end);
      state.lastSubscriptionEventAt=Math.max(state.lastSubscriptionEventAt||0,eventTime);
      if(type==='customer.subscription.deleted')state.terminatedSubscriptions=[...new Set([...(state.terminatedSubscriptions||[]),object.id])];
    } else {
      state.processedEvents.push(eventId);
      state.updatedAt=nowIso(now);
      await this.store.saveBilling(state);
      return {ok:true,ignored:true,state};
    }

    state.processedEvents.push(eventId);
    state.updatedAt=nowIso(now);
    await this.store.saveBilling(state);
    if(before!==JSON.stringify([state.plan,state.status,state.cancelAtPeriodEnd])) await audit(this.store,'billing.changed',{now});
    if(before!==JSON.stringify([state.plan,state.status,state.cancelAtPeriodEnd])){
      await track(this.store,'plan_changed',{now});
      if(ACTIVE_STATUSES.has(state.status)&&state.plan!=='trial')await track(this.store,'subscription_activated',{once:true,now});
      if(state.status==='canceled')await track(this.store,'subscription_canceled',{now});
    }
    return {ok:true,duplicate:false,state};
  }
}

export { tenantIdFromEvent };

export function createBillingService(options) { return new BillingService(options); }
