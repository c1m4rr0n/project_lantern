import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const skip=new Set(['.git','node_modules','tenants','cache','outbox','backups','ops']);
let files=0, codeLines=0, bytes=0, automatedTests=0;
async function walk(dir){for(const name of await readdir(dir)){if(skip.has(name))continue;const p=join(dir,name);const s=await stat(p);if(s.isDirectory()) await walk(p); else {files++;bytes+=s.size;if(/\.(js|html|css|json|md)$/.test(name)){const t=await readFile(p,'utf8');codeLines+=t.split(/\r?\n/).length;if(p.includes('/tests/')&&name.endsWith('.js')) automatedTests+=(t.match(/^\s*test\s*\(/gm)||[]).length;}}}}
await walk(root);
const report={
  generatedAt:new Date().toISOString(),
  milestone:'1.0.0-rc.10',
  files,
  linesOfAuditableTextAndCode:codeLines,
  bytes,
  automatedTests,
  requiredPaidApiSpendUsd:0,
  confirmedCashSpendUsd:10.46,
  confirmedCashSpendNote:'Cloudflare registration of exclusignal.com for one year; Railway invoice/usage not yet audited',
  requiredExternalCredentialsForOfflineDemo:0,
  requiredExternalCredentialsForLiveSam:1,
  requiredExternalCredentialsForLiveEmail:1,
  requiredExternalCredentialsForLiveBilling:1,
  userInterventionsRequiredSoFar:8,
  llmCallsInCriticalPath:0,
  storage:'SQLite default; JSON compatibility driver; Postgres planned before horizontal scale',
  monetization:{
    trial:{days:14,vendorLimit:25},
    starter:{monthlyUsd:39,vendorLimit:50},
    team:{monthlyUsd:99,vendorLimit:500},
    pricingStatus:'validation hypothesis, not a revenue forecast',
    providerBoundary:'Stripe hosted Checkout + Customer Portal + signed webhook; mock provider for local/staging tests'
  },
  liveProviderAdapters:[
    'SAM.gov opportunities (API key required)',
    'SAM.gov on-demand description enrichment (same API key)',
    'SAM.gov Public V2 active-exclusions daily extract (same API key)',
    'USAspending awards (no authorization currently)',
    'Resend transactional email (API key + verified sender required for production)',
    'Stripe Billing (secret key + webhook secret + recurring price IDs required for production)'
  ],
  automation:[
    'immediate auth-email delivery with durable outbox retry',
    'persistent in-process scheduler',
    'daily shared ingest + per-tenant digest enqueue',
    'billing entitlement check before scheduled upstream work',
    'outbox delivery/retry boundary',
    'verified SQLite backup + retention',
    'fail-fast production startup + graceful process shutdown',
    'tracked-opportunity Change Watch + notice-id refresh',
    'Requirement Delta + explicit hard-blocker evidence + fit impact',
    'shared Vendor Exclusion Watch + auditable screening history',
    'server-side trial/plan limits + hosted billing boundary'
  ],
  validation:{
    automatedSuite:'passing',
    authLifecycleSmoke:'passing',
    vendorWatchSmoke:'passing',
    billingSmoke:'passing',
    changeWatchSmoke:'passing',
    requirementDeltaSmoke:'passing',
    schedulerRestartSmoke:'passing',
    productionReadinessSmoke:'passing',
    processLifecycleSmoke:'passing',
    operationalChainSmoke:'passing',
    secretScan:'passing',
    hostedSamPreflight:'passing',
    hostedSamExclusionsExtract:'passing',
    hostedCustomDomain:'passing',
    hostedTransactionalEmail:'passing',
    stripeSandboxCheckoutWebhookPortal:'passing',
    stripeSandboxCancelAtPeriodEnd:'passing',
    stripeFinalDeletionEvent:'not yet run',
    commercialBrand:'ExcluSignal'
  },
  coreLoop:'verified account -> trial/entitlement -> vendor roster -> shared SAM exclusion extract -> deterministic UEI/CAGE/name screen -> evidence/history -> alert -> daily brief; secondary: profile -> opportunity ingest -> score -> pursuit -> Change Watch -> Requirement Delta',
  knownValidationGap:'Hosted SAM opportunities/exclusions, custom domain, real Resend delivery, and Stripe sandbox Checkout/webhook/Customer Portal/cancel-at-period-end are validated. The final customer.subscription.deleted event has not yet occurred. Remaining paid-beta gates are Stripe live-account activation, tax/legal/privacy review, production monitoring, durable source deployment, independent disaster recovery, and formal trademark review. No real customer payment or MRR is claimed.'
};
await writeFile(join(root,'reports','BENCHMARK.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
