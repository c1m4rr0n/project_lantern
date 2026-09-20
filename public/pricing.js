import { humanError } from './polish-model.js';
import { setAccountIdentity, bindLogout } from './ui.js';
const $=s=>document.querySelector(s);
let billing=null;let authenticated=false;
async function jsonOrThrow(response){let payload={};try{payload=await response.json();}catch{}if(!response.ok){const e=new Error(payload.message||payload.error||`Request failed (${response.status})`);e.status=response.status;throw e;}return payload;}
async function load(){
  const me=await fetch('/api/auth/me');
  if(me.ok){authenticated=true;const account=await me.json();setAccountIdentity(account);bindLogout();billing=await jsonOrThrow(await fetch('/api/billing/status'));render();}
  else {$('#billingSummary').textContent='Sign in or create your workspace to start the 14-day trial.';$('#billingStatus').textContent='Billing stays connected to your workspace and screening history.';}
}
function render(){
  const state=billing.state||{};const ent=billing.entitlements||{};
  const cancellation=state.cancelAtPeriodEnd&&state.currentPeriodEnd?` · cancels ${new Date(state.currentPeriodEnd).toLocaleDateString()}`:'';const label=state.plan==='trial'?`Trial · ${ent.trialDaysRemaining??0} day${ent.trialDaysRemaining===1?'':'s'} remaining`:`${state.plan==='team'?'Scale':state.plan==='starter'?'Starter':'Current plan'} · ${{active:'Active',trialing:'Trial',past_due:'Payment overdue',canceled:'Canceled',unpaid:'Payment required',incomplete:'Setup incomplete',incomplete_expired:'Setup expired',paused:'Paused'}[state.status]||'Status unavailable'}${cancellation}`;
  $('#billingSummary').textContent=`Current access: ${label}. Vendor limit: ${ent.vendorLimit}.`;
  $('#billingStatus').textContent=ent.active?'Screening access is active.':`Screening is read-only until a paid plan is activated.`;
  const manage=$('#manageBilling');manage.hidden=!state.customerId;manage.onclick=manageBilling;
  document.querySelectorAll('.planButton').forEach(button=>{const plan=billing.plans?.find(p=>p.key===button.dataset.plan);if(billing.provider!=='stripe'||!plan?.checkoutConfigured){button.textContent='Billing connection pending';button.disabled=true;}});
}
async function checkout(plan){if(!authenticated){location.href='/auth.html';return;}const button=document.querySelector(`[data-plan="${plan}"]`);button.disabled=true;button.textContent='Opening checkout…';try{const result=await jsonOrThrow(await fetch('/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan})}));location.href=result.url;}catch(e){$('#billingStatus').textContent=humanError(e);button.disabled=false;button.textContent=plan==='starter'?'Choose Starter':'Choose Scale';}}
async function manageBilling(){try{const result=await jsonOrThrow(await fetch('/api/billing/portal',{method:'POST'}));location.href=result.url;}catch(e){$('#billingStatus').textContent=humanError(e);}}
document.querySelectorAll('.planButton').forEach(b=>b.onclick=()=>checkout(b.dataset.plan));
if(new URLSearchParams(location.search).get('reason')==='limit'){const banner=document.createElement('p');banner.className='actionNotice';banner.setAttribute('role','status');banner.textContent="You've reached your current vendor limit.";document.querySelector('.pricingHero').prepend(banner);}
load().catch(e=>{$('#billingStatus').textContent=humanError(e);});
