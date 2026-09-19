import { withTenantLock } from '../security/events.js';
const allowed=new Set(['registered','verified','first_login','first_vendor','first_screen','first_import','report_exported','checkout_started','subscription_activated','plan_changed','subscription_canceled','return_activity']);
export async function track(store,event,{once=false,now=new Date()}={}) {
  if(!allowed.has(event))throw new Error('invalid_analytics_event');
  return withTenantLock(`analytics:${store.tenantId}`,async()=>{
    const state=await store.getAnalytics();const day=now.toISOString().slice(0,10);
    if((once&&state.milestones[event])||(event==='return_activity'&&state.lastReturnDay===day))return;
    state.milestones[event] ||= now.toISOString();
    if(event==='return_activity')state.lastReturnDay=day;
    const days=Math.max(1,Number(process.env.ANALYTICS_RETENTION_DAYS)||90);
    state.events=state.events.filter(x=>Date.parse(x.at)>=now.getTime()-days*86400000);
    state.events.push({event,at:now.toISOString()});await store.saveAnalytics(state);
  });
}
export async function analyticsSummary(storage) {
  const users=await storage.accountStore.listUsers(),counts={};
  for(const event of allowed)counts[event]=0;
  for(const user of users){const state=await storage.tenantStore(user.tenantId).getAnalytics();for(const event of allowed)if(state.milestones[event])counts[event]++;}
  return {accounts:users.length,uniqueAccountsReachingMilestone:counts,note:'First-party milestones since instrumentation, excluding deleted accounts. Not a revenue report.'};
}
