import { capacityCopy } from './polish-model.js';
export function feedback(target,message,{error=false}={}){if(!target)return;target.textContent=message;target.classList.remove('actionNotice');target.setAttribute('role','status');target.classList.toggle('isError',error);}
export function capacityFeedback(target,billing,{restore=false}={}){
  const copy=capacityCopy(billing,restore);target.replaceChildren();target.classList.add('actionNotice');target.setAttribute('role','status');
  const title=document.createElement('strong'),message=document.createElement('p'),link=document.createElement('a'),close=document.createElement('button');
  title.textContent=copy.title;message.textContent=copy.message;link.href='/pricing.html?reason=limit';link.textContent='View plans';close.type='button';close.textContent='Close';
  close.onclick=()=>{target.replaceChildren();target.classList.remove('actionNotice');};target.append(title,message,link,close);
}
let confirmationOpen=false;
export function confirmAction({title,message,confirmLabel='Confirm',danger=false}){
  if(confirmationOpen)return Promise.resolve(false);
  confirmationOpen=true;
  return new Promise(resolve=>{
    const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='esDialog';dialog.setAttribute('aria-labelledby','dialogTitle');dialog.setAttribute('aria-describedby','dialogDescription');
    const heading=document.createElement('h2'),description=document.createElement('p'),actions=document.createElement('div');heading.id='dialogTitle';heading.textContent=title;description.id='dialogDescription';description.textContent=message;actions.className='dialogActions';
    const cancel=document.createElement('button'),accept=document.createElement('button');cancel.type=accept.type='button';cancel.textContent='Cancel';accept.textContent=confirmLabel;accept.className=danger?'dangerButton':'primary';
    let settled=false;const finish=value=>{if(settled)return;settled=true;confirmationOpen=false;dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve(value);};
    cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish(false);}});
    dialog.addEventListener('keydown',e=>{if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===cancel){e.preventDefault();accept.focus();}else if(!e.shiftKey&&document.activeElement===accept){e.preventDefault();cancel.focus();}}});
    actions.append(cancel,accept);dialog.append(heading,description,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
