export const TRIAL_DAYS = 14;

export const PAID_PLANS = Object.freeze({
  starter: Object.freeze({
    key:'starter',
    name:'Starter',
    monthlyCents:3900,
    vendorLimit:50,
    stripePriceEnv:'STRIPE_PRICE_STARTER'
  }),
  team: Object.freeze({
    key:'team',
    name:'Scale',
    monthlyCents:9900,
    vendorLimit:500,
    stripePriceEnv:'STRIPE_PRICE_TEAM'
  })
});

export const TRIAL_PLAN = Object.freeze({
  key:'trial',
  name:'Trial',
  monthlyCents:0,
  vendorLimit:25,
  durationDays:TRIAL_DAYS
});

export function getPlan(key) {
  return key === 'trial' ? TRIAL_PLAN : (PAID_PLANS[String(key || '')] || null);
}

export function priceIdForPlan(planKey, env = process.env) {
  const plan = PAID_PLANS[String(planKey || '')];
  return plan ? String(env[plan.stripePriceEnv] || '').trim() : '';
}

export function planKeyFromPriceId(priceId, env = process.env) {
  const value = String(priceId || '');
  return Object.values(PAID_PLANS).find(plan => String(env[plan.stripePriceEnv] || '') === value)?.key || null;
}

export function publicPlans(env = process.env) {
  return [TRIAL_PLAN, ...Object.values(PAID_PLANS)].map(plan => ({
    key:plan.key,
    name:plan.name,
    monthlyCents:plan.monthlyCents,
    vendorLimit:plan.vendorLimit,
    durationDays:plan.durationDays || null,
    checkoutConfigured:plan.key === 'trial' ? false : Boolean(priceIdForPlan(plan.key, env))
  }));
}
