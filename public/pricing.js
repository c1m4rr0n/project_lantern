import { setAccountIdentity, bindLogout } from '/ui.js?v=rc14';
const $=s=>document.querySelector(s);
let billing=null;let authenticated=false;
async function jsonOrThrow(response){let payload={};try{payload=await response.json();}catch{}if(!response.ok){const e=new Error(payload.message||payload.error||`Request failed (${response.status})`);e.status=response.status;throw e;}return payload;}
async function load(){
  const me=await fetch('/api/auth/me');
  if(me.ok){authenticated=true;const account=await me.json();setAccountIdentity(account);bindLogout();billing=await jsonOrThrow(await fetch('/api/billing/status'));render();}
  else {$('#billingSummary').textContent='Sign in or create an account to start the 14-day trial.';$('#billingStatus').textContent='Checkout is tied to your ExcluSignal account so screening history stays with the same tenant.';}
}
function render(){
  const state=billing.state||{};const ent=billing.entitlements||{};
  const cancellation=state.cancelAtPeriodEnd&&state.currentPeriodEnd?` · cancels ${new Date(state.currentPeriodEnd).toLocaleDateString()}`:'';const label=state.plan==='trial'?`Trial · ${ent.trialDaysRemaining??0} day(s) remaining`:`${state.plan} · ${state.status}${cancellation}`;
  $('#billingSummary').textContent=`Current access: ${label}. Vendor limit: ${ent.vendorLimit}.`;
  $('#billingStatus').textContent=ent.active?'Screening access is active.':`Screening is read-only until a paid plan is activated.`;
  const manage=$('#manageBilling');manage.hidden=!state.customerId;manage.onclick=manageBilling;
  document.querySelectorAll('.planButton').forEach(button=>{const plan=billing.plans?.find(p=>p.key===button.dataset.plan);if(billing.provider!=='stripe'||!plan?.checkoutConfigured){button.textContent='Billing connection pending';button.disabled=true;}});
}
async function checkout(plan){if(!authenticated){location.href='/auth.html';return;}const button=document.querySelector(`[data-plan="${plan}"]`);button.disabled=true;button.textContent='Opening checkout…';try{const result=await jsonOrThrow(await fetch('/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan})}));location.href=result.url;}catch(e){$('#billingStatus').textContent=e.message;button.disabled=false;button.textContent=plan==='starter'?'Choose Starter':'Choose Team';}}
async function manageBilling(){try{const result=await jsonOrThrow(await fetch('/api/billing/portal',{method:'POST'}));location.href=result.url;}catch(e){$('#billingStatus').textContent=e.message;}}
document.querySelectorAll('.planButton').forEach(b=>b.onclick=()=>checkout(b.dataset.plan));
load().catch(e=>{$('#billingStatus').textContent=e.message;});
