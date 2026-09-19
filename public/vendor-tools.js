const $=s=>document.querySelector(s);
const status=$('#csvStatus');let text='',preview=null;
async function request(path,options={}) {
  const response=await fetch(path,options),body=await response.json();
  if(!response.ok)throw new Error(body.message||body.error||'Request failed');
  return body;
}
const post=(path,value)=>request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
function resetPreview(){preview=null;$('#csvRows').replaceChildren();$('#csvCommit').hidden=true;}
$('#csvFile').onchange=resetPreview;
$('#csvPreview').onclick=async()=>{
  resetPreview();const file=$('#csvFile').files[0];
  if(!file){status.textContent='Select a CSV file first.';return;}
  if(file.size>1024*1024){status.textContent='File exceeds 1 MiB.';return;}
  const button=$('#csvPreview');button.disabled=true;
  try {
    text=await file.text();preview=await post('/api/vendors/import/preview',{text});
    status.textContent=`${preview.valid} valid, ${preview.invalid} invalid, ${preview.duplicates} duplicate rows. Review and select rows before confirming.`;
    for(const row of preview.rows){
      const label=document.createElement('label');label.className='importRow';
      if(row.status==='valid'){const box=document.createElement('input');box.type='checkbox';box.value=String(row.row);box.checked=true;label.append(box);}
      const span=document.createElement('span');span.textContent=`Row ${row.row}: ${row.value?.legalName||row.value?.uei||''} — ${row.status}${row.error?' · '+row.error:''}`;label.append(span);$('#csvRows').append(label);
    }
    $('#csvCommit').hidden=!preview.valid;
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
};
$('#csvCommit').onclick=async()=>{
  if(!preview)return;
  const rows=[...$('#csvRows').querySelectorAll('input:checked')].map(x=>Number(x.value));
  if(!rows.length){status.textContent='Select at least one valid row.';return;}
  if(!confirm(`Import ${rows.length} vendors? This will not screen them.`))return;
  const button=$('#csvCommit');button.disabled=true;
  try{const result=await post('/api/vendors/import/commit',{text,fingerprint:preview.fingerprint,confirmed:true,rows});status.textContent=`Imported ${result.imported} vendors. Reload the watchlist to view or screen them.`;resetPreview();const link=document.createElement('a');link.href='/vendors.html';link.textContent=' Reload watchlist';status.append(link);}
  catch(error){status.textContent=error.message;resetPreview();}
  finally{button.disabled=false;}
};
$('#loadArchive').onclick=async()=>{
  const list=$('#archiveList');list.replaceChildren();
  try{
    const items=await request('/api/vendors?archived=true');
    if(!items.length)list.textContent='No archived vendors.';
    for(const v of items){
      const card=document.createElement('article');card.className='vendorCard';
      const title=document.createElement('h3');title.textContent=v.legalName||v.uei||v.cage;card.append(title);
      const report=document.createElement('a');report.href=`/api/vendors/${encodeURIComponent(v.id)}/report`;report.textContent='Screening history report';card.append(report);
      const restore=document.createElement('button');restore.type='button';restore.textContent='Restore vendor';
      restore.onclick=async()=>{restore.disabled=true;try{await post(`/api/vendors/${encodeURIComponent(v.id)}/restore`,{});card.remove();status.textContent='Restored. Reload the watchlist to see the vendor.';}catch(error){status.textContent=error.message;restore.disabled=false;}};
      card.append(restore);list.append(card);
    }
  }catch(error){list.textContent=error.message;}
};
