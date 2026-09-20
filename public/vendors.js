import { setAccountIdentity, bindLogout } from './ui.js';
import { confirmAction, capacityFeedback } from './components.js';
import { humanError, sourceLabel } from './polish-model.js';
import { initVendorTools } from './vendor-tools.js';
let vendors=[];let archived=[];let health=null;let billing=null;let toolsUI=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(path,options){const r=await fetch(path,options);if(r.status===401){location.href='/auth.html';throw new Error('Authentication required');}if(!r.ok){const body=await r.text();let m=body;try{const x=JSON.parse(body);m=x.message||x.error||'';}catch{}const e=new Error(m||`Request failed (${r.status})`);e.status=r.status;throw e;}return r.status===204?null:r.json();}
const statusLabel=s=>s==='excluded'?'ACTIVE EXCLUSION':s==='possible-match'?'POSSIBLE MATCH':s==='clear'?'NO MATCH':'NOT SCREENED';
const statusClass=s=>s==='excluded'?'vendorExcluded':s==='possible-match'?'vendorPossible':s==='clear'?'vendorClear':'vendorUnknown';
const friendlyMessage=humanError;
function setActionStatus(message,isError=false){const status=$('#screenAllStatus');if(!status)return;status.textContent=message;status.classList.remove('actionNotice');status.classList.toggle('isError',isError);}
function initWelcomeGuide(){
  const params=new URLSearchParams(location.search);
  if(params.get('welcome')!=='1')return;
  const guide=$('#welcomeGuide');
  if(!guide)return;
  guide.hidden=false;
  history.replaceState(null,'','/vendors.html');
  const dismiss=$('#dismissWelcome');
  if(dismiss)dismiss.onclick=()=>{guide.hidden=true;};
}

function matchRows(item){const matches=item.watch?.latest?.matches||[];if(!matches.length)return'';return `<div class="matchEvidence">${matches.map(m=>`<div><strong>${esc(m.name||'Unnamed record')}</strong><span>${m.uei?`UEI ${esc(m.uei)} · `:''}${m.cage?`CAGE ${esc(m.cage)} · `:''}${esc(m.exclusionType||'Active exclusion')} · ${esc(m.excludingAgency||'Agency not specified')}</span>${m.terminationDate?`<small>Termination: ${esc(m.terminationDate)}</small>`:''}</div>`).join('')}</div>`;}
function render(){
  $('#vendorCount').textContent=vendors.length;
  const b=billing?.entitlements||{};const state=billing?.state||{};const banner=$('#billingBanner');
  if(banner){
    const planName=state.plan==='trial'?'Free trial':state.plan==='team'?'Scale':state.plan?`${state.plan.charAt(0).toUpperCase()}${state.plan.slice(1)}`:'Current plan';
    const remaining=state.plan==='trial'?`${b.trialDaysRemaining} day${b.trialDaysRemaining===1?'':'s'} remaining`:'';
    const cancel=state.cancelAtPeriodEnd&&state.currentPeriodEnd?`Cancels ${new Date(state.currentPeriodEnd).toLocaleDateString()}`:'';
    const planDetail=[remaining,cancel].filter(Boolean).join(' · ');
    banner.classList.toggle('isPaused',!b.active);
    banner.innerHTML=b.active?`<div class="planUsageCopy"><span class="planUsageLabel">${esc(planName)}</span>${planDetail?`<span>${esc(planDetail)}</span>`:''}</div><div class="planUsageMeter" aria-label="${vendors.length} of ${esc(b.vendorLimit)} vendors watched"><strong>${vendors.length}<span> / ${esc(b.vendorLimit)}</span></strong><small>vendors watched</small></div><a href="/pricing.html">Manage plan →</a>`:`<div class="planUsageCopy"><span class="planUsageLabel">Screening paused</span><span>Trial or subscription inactive. Existing evidence remains readable.</span></div><a href="/pricing.html">Restore access →</a>`;
  }
  $('#excludedCount').textContent=vendors.filter(v=>v.watch?.latest?.status==='excluded').length;
  $('#possibleCount').textContent=vendors.filter(v=>v.watch?.latest?.status==='possible-match').length;
  $('#alertCount').textContent=vendors.filter(v=>(v.watch?.unreadCount||0)>0).length;
  const meta=health?.exclusionSnapshot||{};$('#snapshotDate').textContent=meta.sourceDate||'Not screened yet';$('#providerMeta').textContent=sourceLabel(health);
  $('#vendorList').innerHTML=vendors.length?vendors.map(v=>{const last=v.watch?.latest;const status=last?.status||'unscreened';return `<article class="vendorCard"><div class="vendorCardTop"><div><div class="vendorName">${esc(v.legalName||'Unnamed vendor')}</div><div class="meta">${v.uei?`UEI ${esc(v.uei)}`:'No UEI'} · ${v.cage?`CAGE ${esc(v.cage)}`:'No CAGE'}</div></div><span class="vendorStatus ${statusClass(status)}">${statusLabel(status)}</span></div>${last?`<p class="vendorReason">${esc(last.reason||'')}</p><div class="meta">Screened ${new Date(last.screenedAt).toLocaleString()}${last.source?.sourceDate?` · SAM snapshot ${esc(last.source.sourceDate)}`:''}${last.source?.stale?' · STALE SNAPSHOT':''}</div>`:'<p class="meta">Not screened yet.</p>'}${matchRows(v)}${v.notes?`<p class="meta">Note: ${esc(v.notes)}</p>`:''}<div class="vendorActions"><button data-screen="${esc(v.id)}" class="primary smallButton">${last?'Run screening again':'Screen now'}</button>${v.watch?.unreadCount?`<button data-ack="${esc(v.id)}" class="secondaryButton smallButton">Mark reviewed (${v.watch.unreadCount})</button>`:''}<button data-delete="${esc(v.id)}" class="dangerButton smallButton">Archive</button><a class="secondaryButton smallButton" href="/api/vendors/${encodeURIComponent(v.id)}/report" target="_blank" rel="noopener">Evidence report</a></div></article>`;}).join(''):'<div class="empty vendorEmpty"><div class="emptyIcon">◎</div><h2>Your watchlist starts here</h2><p>Add a vendor or review a CSV import. A UEI or CAGE gives stronger identity evidence.</p></div>';
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>screenOne(b.dataset.screen,b));
  document.querySelectorAll('[data-ack]').forEach(b=>b.onclick=()=>ack(b.dataset.ack));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeVendor(b.dataset.delete));
}
async function load(){initWelcomeGuide();const [items,h,me,b,a]=await Promise.all([api('/api/vendors'),api('/api/health'),api('/api/auth/me'),api('/api/billing/status'),api('/api/vendors?archived=true')]);vendors=items;archived=a;health=h;billing=b;setAccountIdentity(me);bindLogout();render();toolsUI?.update();}
async function screenOne(id,button){const previousLabel=button.textContent;let screened=false;const vendorName=button.closest('.vendorCard')?.querySelector('.vendorName')?.textContent||'vendor';button.disabled=true;button.textContent='Screening…';setActionStatus(`Screening ${vendorName}…`);try{await api(`/api/vendors/${encodeURIComponent(id)}/screen`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});screened=true;if(await refreshAfterSave()){setActionStatus(`Screening complete for ${vendorName}.`);document.querySelector(`[data-screen="${CSS.escape(id)}"]`)?.focus();}}catch(e){if(e.status===402)capacityFeedback($('#screenAllStatus'),billing);else setActionStatus(`Screening failed. ${friendlyMessage(e)}`,true);}finally{button.disabled=false;button.textContent=screened?'Run screening again':previousLabel;}}
async function ack(id){try{await api(`/api/vendors/${encodeURIComponent(id)}/screenings/ack`,{method:'POST'});setActionStatus('Marked reviewed.');await refreshAfterSave();$('#screenAll')?.focus?.();}catch(e){setActionStatus(`Could not mark reviewed. ${friendlyMessage(e)}`,true);}}
async function removeVendor(id){const vendor=vendors.find(v=>v.id===id);if(!await confirmAction({title:'Archive vendor?',message:`Archive ${vendor?.legalName||'this vendor'} and stop monitoring it? Screening history will be preserved. You can restore it when a vendor slot is available.`,confirmLabel:'Archive vendor',danger:true}))return;try{await api(`/api/vendors/${encodeURIComponent(id)}`,{method:'DELETE'});setActionStatus('Vendor archived.');await refreshAfterSave();$('#screenAll')?.focus?.();}catch(e){setActionStatus(`Could not archive vendor. ${friendlyMessage(e)}`,true);}}
async function refreshAfterSave(){try{await load();return true;}catch{setActionStatus('Your change was saved, but the watchlist could not refresh. Reload the page to see the latest data.',true);return false;}}
$('#vendorForm').onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),status=$('#formStatus');
  if(button.disabled)return;
  const f=new FormData(form);
  status.classList.remove('isError','actionNotice');
  if(!['legalName','uei','cage'].some(key=>String(f.get(key)||'').trim())){
    status.classList.add('isError');status.textContent='Enter a legal name, UEI or CAGE to add a vendor.';form.querySelector('input').focus();return;
  }
  button.disabled=true;button.textContent='Adding…';form.setAttribute('aria-busy','true');status.textContent='Adding vendor…';
  try{
    await api('/api/vendors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legalName:f.get('legalName'),uei:f.get('uei'),cage:f.get('cage'),notes:f.get('notes')})});
    form.reset();status.textContent='Vendor added. You can screen it from the watchlist.';await refreshAfterSave();
  }catch(err){if(err.status===402)capacityFeedback(status,billing);else{status.classList.add('isError');status.textContent=friendlyMessage(err);}}
  finally{button.disabled=false;button.textContent='Add vendor';form.removeAttribute('aria-busy');}
};
$('#screenAll').onclick=async()=>{const b=$('#screenAll');b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='Screening…';setActionStatus('Screening the full watchlist…');try{const result=await api('/api/vendors/screen',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(await refreshAfterSave())setActionStatus(`Screened ${result.screened} vendor${result.screened===1?'':'s'}: ${result.excluded} active exclusion${result.excluded===1?'':'s'}, ${result.possibleMatches} possible match${result.possibleMatches===1?'':'es'}, ${result.alerts} alert${result.alerts===1?'':'s'}.`);}catch(e){if(e.status===402)capacityFeedback($('#screenAllStatus'),billing);else setActionStatus(`Screening failed. ${friendlyMessage(e)}`,true);}finally{b.disabled=false;b.removeAttribute('aria-busy');b.textContent='Screen all vendors';}};
toolsUI=initVendorTools({api,refresh:refreshAfterSave,getState:()=>({vendors,archived,billing})});
load().catch(e=>{$('#vendorList').innerHTML=`<div class="empty"><h2>Could not load Vendor Watch</h2><p>${esc(friendlyMessage(e))}</p></div>`;});
