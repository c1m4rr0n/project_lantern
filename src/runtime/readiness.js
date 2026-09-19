function httpsOrigin(value) {
  try {
    const url=new URL(String(value || ''));
    return url.protocol==='https:' && Boolean(url.hostname) && url.username==='' && url.password==='' && url.pathname.replace(/\/+$/,'')==='';
  } catch { return false; }
}

export function buildReadinessChecks({
  production=false,
  env={},
  providerName='mock',
  marketProviderName='mock',
  storageDriver='sqlite',
  schedulerEnabled=false
} = {}) {
  const emailProvider=String(env.EMAIL_PROVIDER || 'console');
  const billingProvider=String(env.BILLING_PROVIDER || 'mock');
  const sessionSecret=String(env.SESSION_SECRET || '');
  const checks={
    sessionSecret:!production || sessionSecret.length>=32,
    secureCookie:!production || env.COOKIE_SECURE==='true',
    publicBaseUrl:!production || httpsOrigin(env.PUBLIC_BASE_URL),
    explicitDataRoot:!production || Boolean(String(env.DATA_ROOT || '').trim()),
    storageMode:!production || storageDriver==='sqlite',
    scheduler:!production || schedulerEnabled,
    liveOpportunityProvider:!production || providerName==='sam',
    liveMarketProvider:!production || marketProviderName==='usaspending',
    samCredential:providerName!=='sam' || Boolean(env.SAM_API_KEY),
    emailProviderSupported:['console','resend'].includes(emailProvider),
    liveEmail:!production || emailProvider==='resend',
    emailConfig:emailProvider!=='resend' || Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    billingProviderSupported:['mock','stripe'].includes(billingProvider),
    liveBilling:!production || billingProvider==='stripe',
    billingConfig:billingProvider!=='stripe' || Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_STARTER && env.STRIPE_PRICE_TEAM)
  };
  return checks;
}
