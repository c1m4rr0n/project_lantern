import { setAccountIdentity, bindLogout } from '/ui.js?v=rc14';
let vendors=[];let health=null;let billing=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(path,options){const r=await fetch(path,options);if(r.status===401){location.href='/auth.html';throw new Error('Authentication required');}if(!r.ok){let m='';try{const x=await r.json();m=x.message||x.error||'';}catch{m=await r.text();}const e=new Error(m||`Request failed (${r.status})`);e.status=r.status;throw e;}return r.status===204?null:r.json();}
const statusLabel=s=>s==='excluded'?'ACTIVE EXCLUSION':s==='possible-match'?'POSSIBLE MATCH':s==='clear'?'NO MATCH':'NOT SCREENED';
const statusClass=s=>s==='excluded'?'vendorExcluded':s==='possible-match'?'vendorPossible':s==='clear'?'vendorClear':'vendorUnknown';
const friendlyMessage=error=>{const raw=String(error?.message||'Something went wrong').replaceAll('_',' ').trim();return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}${/[.!?]$/.test(raw)?'':'.'}`;};
function setActionStatus(message,isError=false){const status=$('#screenAllStatus');if(!status)return;status.textContent=message;status.classList.toggle('isError',isError);}
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
    const planName=state.plan==='trial'?'Free trial':state.plan?`${state.plan.charAt(0).toUpperCase()}${state.plan.slice(1)}`:'Current plan';
    const remaining=state.plan==='trial'?`${b.trialDaysRemaining} day${b.trialDaysRemaining===1?'':'s'} remaining`:'';
    const cancel=state.cancelAtPeriodEnd&&state.currentPeriodEnd?`Cancels ${new Date(state.currentPeriodEnd).toLocaleDateString()}`:'';
    const planDetail=[remaining,cancel].filter(Boolean).join(' · ');
    banner.classList.toggle('isPaused',!b.active);
    banner.innerHTML=b.active?`<div class="planUsageCopy"><span class="planUsageLabel">${esc(planName)}</span>${planDetail?`<span>${esc(planDetail)}</span>`:''}</div><div class="planUsageMeter" aria-label="${vendors.length} of ${esc(b.vendorLimit)} vendors watched"><strong>${vendors.length}<span> / ${esc(b.vendorLimit)}</span></strong><small>vendors watched</small></div><a href="/pricing.html">Manage plan →</a>`:`<div class="planUsageCopy"><span class="planUsageLabel">Screening paused</span><span>Trial or subscription inactive. Existing evidence remains readable.</span></div><a href="/pricing.html">Restore access →</a>`;
  }
  $('#excludedCount').textContent=vendors.filter(v=>v.watch?.latest?.status==='excluded').length;
  $('#possibleCount').textContent=vendors.filter(v=>v.watch?.latest?.status==='possible-match').length;
  $('#alertCount').textContent=vendors.filter(v=>(v.watch?.unreadCount||0)>0).length;
  const meta=health?.exclusionSnapshot||{};const provider=health?.exclusionProvider;$('#snapshotDate').textContent=meta.sourceDate||'Not screened yet';$('#providerMeta').textContent=provider&&provider!=='unavailable'?`${provider}${meta.cache?` · ${meta.cache}`:''}`:'Screening unavailable';
  $('#vendorList').innerHTML=vendors.length?vendors.map(v=>{const last=v.watch?.latest;const status=last?.status||'unscreened';return `<article class="vendorCard"><div class="vendorCardTop"><div><div class="vendorName">${esc(v.legalName||'Unnamed vendor')}</div><div class="meta">${v.uei?`UEI ${esc(v.uei)}`:'No UEI'} · ${v.cage?`CAGE ${esc(v.cage)}`:'No CAGE'}</div></div><span class="vendorStatus ${statusClass(status)}">${statusLabel(status)}</span></div>${last?`<p class="vendorReason">${esc(last.reason||'')}</p><div class="meta">Screened ${new Date(last.screenedAt).toLocaleString()}${last.source?.sourceDate?` · SAM snapshot ${esc(last.source.sourceDate)}`:''}${last.source?.stale?' · STALE SNAPSHOT':''}</div>`:'<p class="meta">Not screened yet.</p>'}${matchRows(v)}${v.notes?`<p class="meta">Note: ${esc(v.notes)}</p>`:''}<div class="vendorActions"><button data-screen="${esc(v.id)}" class="primary smallButton">Screen now</button>${v.watch?.unreadCount?`<button data-ack="${esc(v.id)}" class="secondaryButton smallButton">Mark reviewed (${v.watch.unreadCount})</button>`:''}<button data-delete="${esc(v.id)}" class="dangerButton smallButton">Remove</button></div></article>`;}).join(''):'<div class="empty vendorEmpty"><div class="emptyIcon">◎</div><h2>No vendors watched yet</h2><p>Add a subcontractor with its UEI or CAGE to establish the first screening baseline.</p></div>';
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>screenOne(b.dataset.screen,b));
  document.querySelectorAll('[data-ack]').forEach(b=>b.onclick=()=>ack(b.dataset.ack));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeVendor(b.dataset.delete));
}
async function load(){initWelcomeGuide();const [items,h,me,b]=await Promise.all([api('/api/vendors'),api('/api/health'),api('/api/auth/me'),api('/api/billing/status')]);vendors=items;health=h;billing=b;setAccountIdentity(me);bindLogout();render();}
async function screenOne(id,button){const vendorName=button.closest('.vendorCard')?.querySelector('.vendorName')?.textContent||'vendor';button.disabled=true;button.textContent='Screening…';setActionStatus(`Screening ${vendorName}…`);try{await api(`/api/vendors/${encodeURIComponent(id)}/screen`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await load();setActionStatus(`Screening complete for ${vendorName}.`);}catch(e){if(e.status===402)location.href='/pricing.html?reason=access';else setActionStatus(`Screening failed. ${friendlyMessage(e)}`,true);}finally{button.disabled=false;button.textContent='Screen now';}}
async function ack(id){await api(`/api/vendors/${encodeURIComponent(id)}/screenings/ack`,{method:'POST'});await load();}
async function removeVendor(id){if(!confirm('Remove this vendor from the watchlist? Screening history remains in tenant storage for the current MVP.'))return;await api(`/api/vendors/${encodeURIComponent(id)}`,{method:'DELETE'});await load();}
$('#vendorForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const status=$('#formStatus');status.classList.remove('isError');status.textContent='Adding…';try{await api('/api/vendors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legalName:f.get('legalName'),uei:f.get('uei'),cage:f.get('cage'),notes:f.get('notes')})});e.currentTarget.reset();status.textContent='Vendor added.';await load();}catch(err){if(err.status===402)location.href='/pricing.html?reason=limit';else{status.classList.add('isError');status.textContent=friendlyMessage(err);}}};
$('#screenAll').onclick=async()=>{const b=$('#screenAll');b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='Screening…';setActionStatus('Screening the full watchlist…');try{const result=await api('/api/vendors/screen',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await load();setActionStatus(`Screened ${result.screened} vendor${result.screened===1?'':'s'}: ${result.excluded} active exclusion${result.excluded===1?'':'s'}, ${result.possibleMatches} possible match${result.possibleMatches===1?'':'es'}, ${result.alerts} alert${result.alerts===1?'':'s'}.`);}catch(e){if(e.status===402)location.href='/pricing.html?reason=access';else setActionStatus(`Screening failed. ${friendlyMessage(e)}`,true);}finally{b.disabled=false;b.removeAttribute('aria-busy');b.textContent='Screen all vendors';}};
load().catch(e=>{$('#vendorList').innerHTML=`<div class="empty"><h2>Startup error</h2><p>${esc(e.message)}</p></div>`;});
