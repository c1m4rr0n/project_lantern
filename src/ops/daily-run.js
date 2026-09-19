import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDigest } from '../services/digest.js';
import { buildVendorDigest } from '../services/vendor-digest.js';
import { OpportunityService } from '../services/opportunities.js';
import { VendorWatchService } from '../services/vendors.js';

function dayKey(now) { return now.toISOString().slice(0,10); }
function configured(profile) {
  return Boolean(profile?.name || profile?.naics?.length || profile?.capabilities?.length || profile?.setAsides?.length || profile?.regions?.length);
}
async function writeOnce(path, value) {
  try { await writeFile(path, JSON.stringify(value, null, 2), { flag:'wx', mode:0o600 }); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}

export async function runDaily({ accountStore, tenantStoreFor, provider, watchProvider = null, detailProvider = null, exclusionProvider = null, billingStatusFor = null, providerName = 'unknown', seedOpportunities = [], outboxRoot, productName = 'ExcluSignal', now = new Date() }) {
  const startedAt = new Date().toISOString();
  const users = await accountStore.listUsers();
  const results = [];
  const eligible=[];

  for (const user of users) {
    if (!user.emailVerifiedAt) { results.push({tenantId:user.tenantId,status:'skipped-unverified'}); continue; }
    const store = tenantStoreFor(user.tenantId, { seedOpportunities });
    if (billingStatusFor) {
      const billing=await billingStatusFor(user,store);
      if (!billing?.entitlements?.active) { results.push({tenantId:user.tenantId,status:'skipped-billing'}); continue; }
    }
    const [profile,vendors]=await Promise.all([store.getProfile(),store.getVendors?.()||[]]);
    const opportunityReady=configured(profile);
    const vendorReady=Array.isArray(vendors)&&vendors.length>0;
    if (!opportunityReady && !vendorReady) { results.push({tenantId:user.tenantId,status:'skipped-unconfigured'}); continue; }
    eligible.push({user,store,profile,vendors,opportunityReady,vendorReady});
  }

  const opportunityEligible=eligible.filter(x=>x.opportunityReady);
  const vendorEligible=eligible.filter(x=>x.vendorReady);
  const sharedItems = opportunityEligible.length ? await provider() : [];
  const exclusionSnapshot = vendorEligible.length && exclusionProvider ? await exclusionProvider.getSnapshot() : null;
  await mkdir(outboxRoot, { recursive:true });

  for (const {user,store,profile,opportunityReady,vendorReady} of eligible) {
    let items=[];
    if(opportunityReady){
      const service = new OpportunityService({ store, provider:async()=>sharedItems, watchProvider, detailProvider, excludeDemoSeed:providerName !== 'mock' });
      await service.sync();
      items = await service.list();
    }
    let vendorDigest=buildVendorDigest(await store.getVendors?.()||[]);
    let vendorScreening=null;
    if(vendorReady){
      if(!exclusionProvider) throw new Error('vendor exclusion provider is not configured');
      const vendorService=new VendorWatchService({store,exclusionProvider});
      vendorScreening=await vendorService.screenAll({now,snapshot:exclusionSnapshot});
      vendorDigest=buildVendorDigest(await vendorService.list());
    }
    const digest = buildDigest(profile, items, now, vendorDigest);
    const idempotencyKey = `daily:${dayKey(now)}:${user.tenantId}`;
    const message = {
      idempotencyKey,
      channel:'email',
      template:'daily-digest',
      to:user.email,
      createdAt:new Date().toISOString(),
      payload:{...digest,productName}
    };
    const path = join(outboxRoot, `${dayKey(now)}-${user.tenantId}.json`);
    const created = await writeOnce(path, message);
    results.push({ tenantId:user.tenantId, status:created ? 'queued' : 'already-queued', strongCount:digest.strongCount, deadlineCount:digest.deadlineCount, changedCount:digest.changedCount || 0, vendorCount:vendorDigest.total, vendorAlerts:vendorDigest.alertCount, vendorsScreened:vendorScreening?.screened||0 });
  }

  return {
    ok:true,
    startedAt,
    finishedAt:new Date().toISOString(),
    date:dayKey(now),
    tenants:users.length,
    eligibleTenants:eligible.length,
    opportunityEligibleTenants:opportunityEligible.length,
    vendorEligibleTenants:vendorEligible.length,
    opportunitiesFetched:sharedItems.length,
    exclusionsSnapshotFetched:Boolean(exclusionSnapshot),
    queued:results.filter(x=>x.status==='queued').length,
    alreadyQueued:results.filter(x=>x.status==='already-queued').length,
    skipped:results.filter(x=>x.status.startsWith('skipped')).length,
    results
  };
}
