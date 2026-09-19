import { setAccountIdentity, bindLogout } from '/ui.js?v=rc13';
let vendors=[];let health=null;let billing=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(path,options){const r=await fetch(path,options);if(r.status===401){location.href='/auth.html';throw new Error('Authentication required');}if(!r.ok){let m='';try{const x=await r.json();m=x.message||x.error||'';}catch{m=await r.text();}const e=new Error(m||`Request failed (${r.status})`);e.status=r.status;throw e;}return r.status===204?null:r.json();}
const statusLabel=s=>s==='excluded'?'ACTIVE EXCLUSION':s==='possible-match'?'POSSIBLE MATCH':s==='clear'?'NO MATCH':'NOT SCREENED';
const statusClass=s=>s==='excluded'?'vendorExcluded':s==='possible-match'?'vendorPossible':s==='clear'?'vendorClear':'vendorUnknown';
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
  if(banner){const cancel=state.cancelAtPeriodEnd&&state.currentPeriodEnd?` · cancels ${esc(new Date(state.currentPeriodEnd).toLocaleDateString())}`:'';banner.innerHTML=b.active?`<strong>${esc(state.plan==='trial'?`Trial · ${b.trialDaysRemaining} day(s) left`:state.plan)}${cancel}</strong> · ${vendors.length}/${b.vendorLimit} vendors watched · <a href="/pricing.html">View plan</a>`:`<strong>Screening paused.</strong> Trial/subscription inactive. Existing evidence remains readable. <a href="/pricing.html">Restore access →</a>`;}
  $('#excludedCount').textContent=vendors.filter(v=>v.watch?.latest?.status==='excluded').length;
  $('#possibleCount').textContent=vendors.filter(v=>v.watch?.latest?.status==='possible-match').length;
  $('#alertCount').textContent=vendors.filter(v=>(v.watch?.unreadCount||0)>0).length;
  const meta=health?.exclusionSnapshot||{};$('#snapshotDate').textContent=meta.sourceDate||'—';$('#providerMeta').textContent=health?.exclusionProvider?`${health.exclusionProvider}${meta.cache?` · ${meta.cache}`:''}`:'screening unavailable';
  $('#vendorList').innerHTML=vendors.length?vendors.map(v=>{const last=v.watch?.latest;const status=last?.status||'unscreened';return `<article class="vendorCard"><div class="vendorCardTop"><div><div class="vendorName">${esc(v.legalName||'Unnamed vendor')}</div><div class="meta">${v.uei?`UEI ${esc(v.uei)}`:'No UEI'} · ${v.cage?`CAGE ${esc(v.cage)}`:'No CAGE'}</div></div><span class="vendorStatus ${statusClass(status)}">${statusLabel(status)}</span></div>${last?`<p class="vendorReason">${esc(last.reason||'')}</p><div class="meta">Screened ${new Date(last.screenedAt).toLocaleString()}${last.source?.sourceDate?` · SAM snapshot ${esc(last.source.sourceDate)}`:''}${last.source?.stale?' · STALE SNAPSHOT':''}</div>`:'<p class="meta">Not screened yet.</p>'}${matchRows(v)}${v.notes?`<p class="meta">Note: ${esc(v.notes)}</p>`:''}<div class="vendorActions"><button data-screen="${esc(v.id)}" class="primary smallButton">Screen now</button>${v.watch?.unreadCount?`<button data-ack="${esc(v.id)}" class="secondaryButton smallButton">Mark reviewed (${v.watch.unreadCount})</button>`:''}<button data-delete="${esc(v.id)}" class="dangerButton smallButton">Remove</button></div></article>`;}).join(''):'<div class="empty vendorEmpty"><div class="emptyIcon">◎</div><h2>No vendors watched yet</h2><p>Add a subcontractor with its UEI or CAGE to establish the first screening baseline.</p></div>';
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>screenOne(b.dataset.screen,b));
  document.querySelectorAll('[data-ack]').forEach(b=>b.onclick=()=>ack(b.dataset.ack));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>removeVendor(b.dataset.delete));
}
async function load(){initWelcomeGuide();const [items,h,me,b]=await Promise.all([api('/api/vendors'),api('/api/health'),api('/api/auth/me'),api('/api/billing/status')]);vendors=items;health=h;billing=b;setAccountIdentity(me);bindLogout();render();}
async function screenOne(id,button){button.disabled=true;button.textContent='Screening…';try{await api(`/api/vendors/${encodeURIComponent(id)}/screen`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await load();}catch(e){if(e.status===402)location.href='/pricing.html?reason=access';else alert(`Screening failed: ${e.message}`);}finally{button.disabled=false;}}
async function ack(id){await api(`/api/vendors/${encodeURIComponent(id)}/screenings/ack`,{method:'POST'});await load();}
async function removeVendor(id){if(!confirm('Remove this vendor from the watchlist? Screening history remains in tenant storage for the current MVP.'))return;await api(`/api/vendors/${encodeURIComponent(id)}`,{method:'DELETE'});await load();}
$('#vendorForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const status=$('#formStatus');status.textContent='Adding…';try{await api('/api/vendors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legalName:f.get('legalName'),uei:f.get('uei'),cage:f.get('cage'),notes:f.get('notes')})});e.currentTarget.reset();status.textContent='Vendor added.';await load();}catch(err){if(err.status===402)location.href='/pricing.html?reason=limit';else status.textContent=err.message;}};
$('#screenAll').onclick=async()=>{const b=$('#screenAll');b.disabled=true;b.textContent='Screening…';try{const result=await api('/api/vendors/screen',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await load();alert(`Screened ${result.screened} vendor(s). ${result.excluded} active exclusion(s), ${result.possibleMatches} possible match(es), ${result.alerts} alert(s).`);}catch(e){if(e.status===402)location.href='/pricing.html?reason=access';else alert(`Screening failed: ${e.message}`);}finally{b.disabled=false;b.textContent='Screen all';}};
load().catch(e=>{$('#vendorList').innerHTML=`<div class="empty"><h2>Startup error</h2><p>${esc(e.message)}</p></div>`;});
