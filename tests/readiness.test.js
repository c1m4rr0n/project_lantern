import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadinessChecks } from '../src/runtime/readiness.js';

const prodEnv={
  SESSION_SECRET:'x'.repeat(32), COOKIE_SECURE:'true', PUBLIC_BASE_URL:'https://lantern.example.com', DATA_ROOT:'/data',
  SAM_API_KEY:'configured', EMAIL_PROVIDER:'resend', RESEND_API_KEY:'configured', EMAIL_FROM:'ExcluSignal <alerts@example.com>', BILLING_PROVIDER:'stripe', STRIPE_SECRET_KEY:'sk_test_x', STRIPE_WEBHOOK_SECRET:'whsec_x', STRIPE_PRICE_STARTER:'price_start', STRIPE_PRICE_TEAM:'price_team'
};

test('production readiness accepts the intended single-instance live configuration',()=>{
  const checks=buildReadinessChecks({production:true,env:prodEnv,providerName:'sam',marketProviderName:'usaspending',storageDriver:'sqlite',schedulerEnabled:true});
  assert.equal(Object.values(checks).every(Boolean),true);
});

test('production readiness rejects development defaults that would make public accounts unusable',()=>{
  const checks=buildReadinessChecks({production:true,env:{...prodEnv,EMAIL_PROVIDER:'console',DATA_ROOT:'',COOKIE_SECURE:'false'},providerName:'mock',marketProviderName:'mock',storageDriver:'sqlite',schedulerEnabled:false});
  assert.equal(checks.secureCookie,false);
  assert.equal(checks.explicitDataRoot,false);
  assert.equal(checks.scheduler,false);
  assert.equal(checks.liveOpportunityProvider,false);
  assert.equal(checks.liveMarketProvider,false);
  assert.equal(checks.liveEmail,false);
  assert.equal(checks.liveBilling,true);
});

test('SAM production configuration requires a credential and rejects malformed public origins',()=>{
  const checks=buildReadinessChecks({production:true,env:{...prodEnv,SAM_API_KEY:'',PUBLIC_BASE_URL:'http://localhost:8787'},providerName:'sam',marketProviderName:'usaspending',storageDriver:'sqlite',schedulerEnabled:true});
  assert.equal(checks.samCredential,false);
  assert.equal(checks.publicBaseUrl,false);
});


test('production readiness requires live Stripe billing and complete price/webhook configuration',()=>{
  const mock=buildReadinessChecks({production:true,env:{...prodEnv,BILLING_PROVIDER:'mock'},providerName:'sam',marketProviderName:'usaspending',storageDriver:'sqlite',schedulerEnabled:true});
  assert.equal(mock.liveBilling,false);
  const incomplete=buildReadinessChecks({production:true,env:{...prodEnv,STRIPE_WEBHOOK_SECRET:''},providerName:'sam',marketProviderName:'usaspending',storageDriver:'sqlite',schedulerEnabled:true});
  assert.equal(incomplete.billingConfig,false);
});
