import { confirmAction, capacityFeedback, feedback } from './components.js';
import { classifyImport, humanError, importCapacity } from './polish-model.js';
export function initVendorTools({api,refresh,getState}){
  const $=s=>document.querySelector(s),status=$('#csvStatus');
  let text='',preview=null,busy=false,archiveOpen=false;
  const post=(path,value)=>api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
  const selected=()=>[...$('#csvRows').querySelectorAll('input:checked')].map(x=>Number(x.value));
  function reset(){preview=null;$('#csvRows').replaceChildren();$('#csvReview').hidden=true;$('#csvCommit').hidden=true;}
  function capacity(){
    if(!preview)return;
    const state=getState(),count=selected().length,c=importCapacity(state.billing,state.vendors.length,count);
    $('#csvCapacity').textContent=`${c.available} slots available · ${count} selected`;
    $('#csvCommit').textContent=`Import ${count} vendor${count===1?'':'s'}`;$('#csvCommit').disabled=busy||!c.allowed;
    if(count>c.available)capacityFeedback(status,state.billing);
  }
  function lock(value){busy=value;for(const id of ['csvFile','csvPreview','csvSelectAll','csvClear','csvCancel'])$('#'+id).disabled=value;$('#csvRows').querySelectorAll('input').forEach(x=>x.disabled=value);capacity();}
  function renderPreview(){
    const state=getState(),rows=classifyImport(preview.rows,[...state.vendors,...state.archived]);
    $('#csvSummary').replaceChildren();
    for(const [label,n] of [['Total rows',rows.length],['Ready',preview.valid],['Duplicate',preview.duplicates],['Needs attention',preview.invalid]]){
      const card=document.createElement('div'),number=document.createElement('strong'),caption=document.createElement('span');number.textContent=n;caption.textContent=label;card.append(number,caption);$('#csvSummary').append(card);
    }
    const table=document.createElement('table');table.className='importTable';table.innerHTML='<caption class="srOnly">Review imported vendors before confirming</caption><thead><tr><th>Select</th><th>Vendor</th><th>UEI</th><th>CAGE</th><th>Status</th><th>Issue / action</th></tr></thead>';
    const body=document.createElement('tbody');
    for(const row of rows){
      const tr=document.createElement('tr'),v=row.value||{};
      const cells=['Select','Vendor','UEI','CAGE','Status','Issue / action'].map(label=>{const td=document.createElement('td');td.dataset.label=label;tr.append(td);return td;});
      if(row.status==='valid'){const box=document.createElement('input'),label=document.createElement('label');label.className='importSelect';box.type='checkbox';box.checked=true;box.value=String(row.row);box.setAttribute('aria-label',`Select row ${row.row}: ${v.legalName||v.uei||v.cage}`);box.onchange=()=>{feedback(status,'');capacity();};label.append(box);cells[0].append(label);}else cells[0].textContent='—';
      cells[1].textContent=v.legalName||`Row ${row.row}`;cells[2].textContent=v.uei||'—';cells[3].textContent=v.cage||'—';
      const badge=document.createElement('span');badge.className='reviewBadge '+row.status;badge.textContent={valid:'Ready',duplicate:'Duplicate',invalid:'Invalid'}[row.status];cells[4].append(badge);cells[5].textContent=row.issue||(row.status==='valid'?'Ready to import':'Review this row');body.append(tr);
    }
    table.append(body);$('#csvRows').replaceChildren(table);$('#csvReview').hidden=false;$('#csvCommit').hidden=false;capacity();
  }
  $('#csvFile').onchange=()=>{reset();feedback(status,'');};
  $('#csvPreview').onclick=async()=>{
    if(busy)return;reset();const file=$('#csvFile').files[0];
    if(!file){feedback(status,'Choose a CSV file first.');return;}
    if(file.size>1024*1024){feedback(status,humanError('CSV exceeds 1 MiB'),{error:true});return;}
    busy=true;$('#csvPreview').disabled=true;$('#csvFile').disabled=true;
    try{text=await file.text();preview=await post('/api/vendors/import/preview',{text});feedback(status,'Review the rows below. Nothing has been imported yet.');renderPreview();}
    catch(e){feedback(status,humanError(e),{error:true});}
    finally{busy=false;$('#csvPreview').disabled=false;$('#csvFile').disabled=false;capacity();}
  };
  $('#csvSelectAll').onclick=()=>{$('#csvRows').querySelectorAll('input').forEach(x=>x.checked=true);feedback(status,'');capacity();};
  $('#csvClear').onclick=()=>{$('#csvRows').querySelectorAll('input').forEach(x=>x.checked=false);feedback(status,'');capacity();};
  $('#csvCancel').onclick=()=>{if(busy)return;reset();feedback(status,'Import canceled. Your watchlist has not changed.');$('#csvPreview').focus();};
  $('#csvCommit').onclick=async()=>{
    if(!preview||busy)return;
    const state=getState(),rows=selected();
    if(!importCapacity(state.billing,state.vendors.length,rows.length).allowed){capacityFeedback(status,state.billing);return;}
    lock(true);
    if(!await confirmAction({title:'Import vendors?',message:`Add ${rows.length} selected vendors to this workspace? This will not screen them automatically.`,confirmLabel:`Import ${rows.length} vendors`})){lock(false);return;}
    try{const result=await post('/api/vendors/import/commit',{text,fingerprint:preview.fingerprint,rows,confirmed:true});reset();const ok=await refresh();feedback(status,`Imported ${result.imported} vendors. ${ok?'Your watchlist is up to date.':'The import was saved, but refresh failed. Reload before importing again.'}`);status.tabIndex=-1;status.focus();}
    catch(e){if(e.status===402)capacityFeedback(status,getState().billing);else feedback(status,humanError(e),{error:true});reset();}
    finally{lock(false);}
  };
  function archive(){
    if(!archiveOpen)return;const list=$('#archiveList');list.replaceChildren();
    const items=getState().archived;
    if(!items.length){list.textContent='No archived vendors.';return;}
    for(const v of items){
      const card=document.createElement('article');card.className='vendorCard';const title=document.createElement('h3'),actions=document.createElement('div'),report=document.createElement('a'),restore=document.createElement('button'),notice=document.createElement('div');
      title.textContent=v.legalName||v.uei||v.cage;actions.className='vendorActions';report.href=`/api/vendors/${encodeURIComponent(v.id)}/report`;report.textContent='Screening history report';report.className='secondaryButton';restore.type='button';restore.textContent='Restore vendor';
      restore.onclick=async()=>{if(restore.disabled)return;restore.disabled=true;try{await post(`/api/vendors/${encodeURIComponent(v.id)}/restore`,{});feedback(notice,'Vendor restored.');const ok=await refresh();if(ok){feedback($('#archiveStatus'),'Vendor restored. Watchlist and capacity updated.');$('#loadArchive').focus();}else feedback(notice,'Vendor restored, but refresh failed. Reload to see the latest data.');}catch(e){if(e.status===402)capacityFeedback(notice,getState().billing,{restore:true});else feedback(notice,humanError(e),{error:true});restore.disabled=false;}};
      actions.append(report,restore);card.append(title,actions,notice);list.append(card);
    }
  }
  const archiveStatus=document.createElement('p');archiveStatus.id='archiveStatus';archiveStatus.setAttribute('role','status');$('#archiveList').before(archiveStatus);
  $('#loadArchive').onclick=()=>{archiveOpen=!archiveOpen;$('#archiveList').hidden=!archiveOpen;$('#loadArchive').textContent=archiveOpen?'Hide archived vendors':'Show archived vendors';$('#loadArchive').setAttribute('aria-expanded',String(archiveOpen));archive();};
  return {update(){archive();capacity();}};
}
