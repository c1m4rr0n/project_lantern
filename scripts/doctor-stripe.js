import { resolve } from 'node:path';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { StripeBillingProvider } from '../src/billing/stripe.js';
import { BillingService } from '../src/billing/service.js';
if(!/^sk_test_/.test(process.env.STRIPE_SECRET_KEY||''))throw new Error('Doctor accepts Stripe test credentials only');
if(!process.env.DATA_ROOT)throw new Error('Set DATA_ROOT explicitly for reconciliation');
const apply=process.argv.includes('--apply');
if(apply&&process.env.STRIPE_RECONCILE_OFFLINE!=='true')throw new Error('Stop the application writer and set STRIPE_RECONCILE_OFFLINE=true before applying');
const storage=createStorageManager({driver:process.env.STORAGE_DRIVER||'sqlite',dataRoot:resolve(process.env.DATA_ROOT||'data')});
const provider=new StripeBillingProvider();let checked=0,different=0;
try{
  for(const user of await storage.accountStore.listUsers()){
    const store=storage.tenantStore(user.tenantId),state=await store.getBilling();if(!state?.subscriptionId)continue;
    const actual=await provider.retrieveSubscription(state.subscriptionId);
    if(actual.livemode!==false)throw new Error('Refusing non-sandbox subscription');
    if(actual.metadata?.tenant_id!==user.tenantId)throw new Error('Subscription tenant mismatch');
    checked++;if(actual.status!==state.status||Boolean(actual.cancel_at_period_end)!==Boolean(state.cancelAtPeriodEnd)||provider.planKeyFromPriceId(actual.items?.data?.[0]?.price?.id)!==state.plan)different++;
    if(apply){const now=Date.now();await new BillingService({store,tenantId:user.tenantId,provider}).applyStripeEvent({id:`reconcile_${actual.id}_${now}`,created:Math.floor(now/1000),type:actual.status==='canceled'?'customer.subscription.deleted':'customer.subscription.updated',data:{object:actual}});}
  }
  console.log(JSON.stringify({mode:apply?'apply':'read-only',checked,different}));
}catch{console.error(JSON.stringify({error:'stripe_reconciliation_failed'}));process.exitCode=1;}finally{storage.close();}
