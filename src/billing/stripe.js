import { createHmac, timingSafeEqual } from 'node:crypto';
import { PAID_PLANS, planKeyFromPriceId, priceIdForPlan } from './plans.js';

function constantTimeHexEqual(a, b) {
  try {
    const left=Buffer.from(String(a || ''),'hex');
    const right=Buffer.from(String(b || ''),'hex');
    return left.length>0 && left.length===right.length && timingSafeEqual(left,right);
  } catch { return false; }
}

export function verifyStripeSignature(rawBody, header, secret, { now = new Date(), toleranceSeconds = 300 } = {}) {
  if (!secret) throw new Error('stripe webhook secret is not configured');
  const parts=String(header || '').split(',').map(x=>x.trim()).filter(Boolean);
  const timestamp=parts.find(x=>x.startsWith('t='))?.slice(2);
  const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if (!timestamp || !signatures.length || !/^\d+$/.test(timestamp)) throw new Error('invalid stripe signature header');
  const age=Math.abs(Math.floor(now.getTime()/1000)-Number(timestamp));
  if (age>Math.max(1,Number(toleranceSeconds)||300)) throw new Error('stale stripe signature');
  const expected=createHmac('sha256',secret).update(`${timestamp}.${rawBody}`).digest('hex');
  if (!signatures.some(signature=>constantTimeHexEqual(signature,expected))) throw new Error('invalid stripe signature');
  let event;
  try { event=JSON.parse(rawBody); }
  catch { throw new Error('invalid stripe webhook json'); }
  return event;
}

async function stripeRequest(path, { apiKey, fetchFn = fetch, form } = {}) {
  if (!apiKey) throw new Error('stripe api key is not configured');
  const response=await fetchFn(`https://api.stripe.com${path}`,{
    method:'POST',
    headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/x-www-form-urlencoded'},
    body:form
  });
  const text=await response.text();
  let json={};
  try { json=text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  return json;
}

export class StripeBillingProvider {
  constructor({ env = process.env, fetchFn = fetch } = {}) {
    this.name='stripe';
    this.env=env;
    this.fetchFn=fetchFn;
  }

  configured() {
    return Boolean(this.env.STRIPE_SECRET_KEY && this.env.STRIPE_WEBHOOK_SECRET && priceIdForPlan('starter',this.env) && priceIdForPlan('team',this.env));
  }

  async createCheckout({ tenantId, email, planKey, customerId = null, successUrl, cancelUrl }) {
    if (!PAID_PLANS[planKey]) throw new Error('invalid paid plan');
    const priceId=priceIdForPlan(planKey,this.env);
    if (!priceId) throw new Error(`stripe price is not configured for ${planKey}`);
    const form=new URLSearchParams();
    form.set('mode','subscription');
    form.set('success_url',successUrl);
    form.set('cancel_url',cancelUrl);
    form.set('client_reference_id',tenantId);
    form.set('line_items[0][price]',priceId);
    form.set('line_items[0][quantity]','1');
    form.set('allow_promotion_codes','true');
    form.set('metadata[tenant_id]',tenantId);
    form.set('metadata[plan_key]',planKey);
    form.set('subscription_data[metadata][tenant_id]',tenantId);
    form.set('subscription_data[metadata][plan_key]',planKey);
    if (customerId) form.set('customer',customerId);
    else if (email) form.set('customer_email',email);
    const session=await stripeRequest('/v1/checkout/sessions',{apiKey:this.env.STRIPE_SECRET_KEY,fetchFn:this.fetchFn,form});
    if (!session.url) throw new Error('Stripe checkout did not return a URL');
    return { id:session.id, url:session.url };
  }

  async createPortal({ customerId, returnUrl }) {
    if (!customerId) throw new Error('stripe customer is not available');
    const form=new URLSearchParams({customer:customerId,return_url:returnUrl});
    const session=await stripeRequest('/v1/billing_portal/sessions',{apiKey:this.env.STRIPE_SECRET_KEY,fetchFn:this.fetchFn,form});
    if (!session.url) throw new Error('Stripe portal did not return a URL');
    return { id:session.id, url:session.url };
  }

  verifyWebhook(rawBody, signatureHeader, options={}) {
    return verifyStripeSignature(rawBody,signatureHeader,this.env.STRIPE_WEBHOOK_SECRET,options);
  }

  planKeyFromPriceId(priceId) { return planKeyFromPriceId(priceId,this.env); }
}

export class MockBillingProvider {
  constructor() { this.name='mock'; }
  configured() { return true; }
  async createCheckout() { throw new Error('live billing is not configured'); }
  async createPortal() { throw new Error('live billing is not configured'); }
  verifyWebhook() { throw new Error('live billing is not configured'); }
  planKeyFromPriceId() { return null; }
}

export function createBillingProvider({ env = process.env, fetchFn = fetch } = {}) {
  const name=String(env.BILLING_PROVIDER || 'mock').toLowerCase();
  if (name==='stripe') return new StripeBillingProvider({env,fetchFn});
  if (name==='mock') return new MockBillingProvider();
  throw new Error(`unsupported billing provider: ${name}`);
}
