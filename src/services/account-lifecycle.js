import { mkdir,readFile,readdir,writeFile,rename,rm } from 'node:fs/promises';
import { join,resolve,sep } from 'node:path';
import { audit } from '../security/events.js';
import { blockActivity } from '../security/activity.js';
const safeId=id=>/^[a-zA-Z0-9-]{8,80}$/.test(id);
const terminal=new Set(['canceled','incomplete_expired']);
export async function assertDeletionBilling(state,provider) {
  if(state?.checkoutPending)throw Object.assign(new Error('A checkout is pending reconciliation. Contact support to confirm no subscription remains before deletion.'),{status:409});
  if(state?.customerId){
    const subscriptions=await provider.customerSubscriptions(state.customerId);
    if(!Array.isArray(subscriptions)||subscriptions.some(s=>!terminal.has(s.status)))throw Object.assign(new Error('Cancel all billing subscriptions and wait until they end before deleting.'),{status:409});
  }
  if(!state?.subscriptionId)return;
  if(!terminal.has(state.status))throw Object.assign(new Error('Cancel your subscription in Manage billing and wait until it has ended before deleting the account.'),{status:409});
  const actual=await provider.retrieveSubscription(state.subscriptionId);
  if(actual.id!==state.subscriptionId||!terminal.has(actual.status))throw Object.assign(new Error('Subscription closure is not confirmed. Manage billing before deletion.'),{status:409});
}
export async function exportAccount({user,store}) {
  await audit(store,'account.exported');
  const billing=await store.getBilling();
  const safeBilling=billing?Object.fromEntries(['provider','plan','status','trialStartedAt','trialEndsAt','currentPeriodEnd','cancelAtPeriodEnd','updatedAt'].map(k=>[k,billing[k]??null])):null;
  return {schemaVersion:1,exportedAt:new Date().toISOString(),account:{id:user.id||user.userId,email:user.email,createdAt:user.createdAt},profile:await store.getProfile(),vendors:await store.getVendors(),screenings:await store.getVendorScreenings(),opportunities:await store.getOpportunities(),decisions:await store.getDecisions(),opportunityChanges:await store.getOpportunityChanges(),audit:await store.getAuditEvents(),billing:safeBilling};
}
async function saveJob(path,job){await writeFile(path+'.tmp',JSON.stringify(job),{mode:0o600});await rename(path+'.tmp',path);}
async function finishDeletion({storage,dataRoot,job,path}) {
  if(!safeId(job.tenantId)||!safeId(job.userId))throw new Error('invalid deletion identity');
  await storage.accountStore.deleteAccount(job.userId);
  await storage.eraseTenant(job.tenantId);
  const outbox=resolve(dataRoot,'outbox');
  for(const directory of [outbox,join(outbox,'sent'),join(outbox,'failed')]) {
    let files=[];try{files=await readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const file of files.filter(x=>x.endsWith('.json'))){const target=resolve(directory,file);if(!target.startsWith(outbox+sep))throw new Error('unsafe outbox path');const message=JSON.parse(await readFile(target,'utf8'));if(message.to===job.email||message.idempotencyKey?.includes(job.tenantId))await rm(target);}
  }
  await saveJob(path,{tenantId:job.tenantId,userId:job.userId,requestedAt:job.requestedAt,completedAt:new Date().toISOString(),status:'complete',action:'account.deleted'});
}
export async function deleteAccount({storage,dataRoot,user,store,billing,provider,confirmation}) {
  if(confirmation!=='DELETE')throw Object.assign(new Error('Type DELETE to confirm account deletion'),{status:400});
  await assertDeletionBilling(billing,provider);
  await audit(store,'account.deletion_requested');
  const dir=join(dataRoot,'ops','deletions');await mkdir(dir,{recursive:true});
  const job={userId:user.id||user.userId,tenantId:user.tenantId,email:user.email,requestedAt:new Date().toISOString(),status:'pending'};
  if(!safeId(job.tenantId)||!safeId(job.userId))throw new Error('invalid deletion identity');
  const path=join(dir,job.tenantId+'.json');await saveJob(path,job);
  try{await finishDeletion({storage,dataRoot,job,path});}catch(error){blockActivity();throw error;}return {ok:true};
}
export async function resumeDeletions({storage,dataRoot}) {
  const dir=join(dataRoot,'ops','deletions');let files=[];
  try{files=await readdir(dir);}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const file of files.filter(x=>x.endsWith('.json'))){const path=join(dir,file),job=JSON.parse(await readFile(path,'utf8'));if(job.status==='pending')await finishDeletion({storage,dataRoot,job,path});}
}
