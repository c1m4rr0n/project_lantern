import { initAccount } from './ui.js';
import { confirmAction } from './components.js';
import { humanError } from './polish-model.js';
const status=document.querySelector('#accountStatus');
initAccount().catch(()=>{status.textContent='Could not load account. Reload or contact support.';});
for(const action of ['export','delete'])document.querySelector(`#${action}Form`).onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
  if(button.disabled)return;
  if(action==='delete'&&!await confirmAction({title:'Permanently delete this workspace?',message:'This removes your sign-in credentials, vendors and retained evidence. It cannot be undone in the application. Historical backups expire separately. Your password and DELETE confirmation are still required.',confirmLabel:'Delete workspace permanently',danger:true}))return;
  button.disabled=true;const input=Object.fromEntries(new FormData(form));
  try{
    const response=await fetch(`/api/account/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'Request failed');
    if(action==='delete'){location.href='/auth.html?deleted=1';return;}
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='exclusignal-account.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    form.reset();status.textContent='Export downloaded. Keep it secure.';
  }catch(error){status.textContent=humanError(error,'This action could not complete. For deletion, billing must be fully ended with no pending checkout. If access was revoked or the problem persists, contact support before retrying.');}finally{button.disabled=false;}
};
