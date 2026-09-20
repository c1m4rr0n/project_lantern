import { humanError, passwordMismatch } from './polish-model.js';
const $=s=>document.querySelector(s);
async function post(path,payload){try{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});return {r,data:await r.json().catch(()=>({}))};}catch{return {r:{ok:false,status:0},data:{error:'Failed to fetch'}};}}
function message(el,text,good=false){el.textContent=text;el.classList.toggle('successText',good);}
document.querySelectorAll('input[type=password]').forEach((input,index)=>{
  input.id||='password-'+index;
  const button=document.createElement('button');button.type='button';button.className='passwordToggle';button.textContent='Show password';button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');
  button.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide password':'Show password';button.setAttribute('aria-pressed',String(show));};input.after(button);
});
const params=new URLSearchParams(location.search),verifyToken=params.get('verify'),resetToken=params.get('reset');
if(verifyToken||resetToken)history.replaceState(null,'','/auth.html');
if(params.get('deleted')==='1')message($('#loginStatus'),'Your workspace was deleted.');
if(verifyToken||resetToken){
  $('#standardAuth').hidden=true;$('#recovery').hidden=true;$('#tokenFlow').hidden=false;
  if(verifyToken){
    $('#tokenEyebrow').textContent='EMAIL VERIFICATION';$('#tokenTitle').textContent='Verifying your email…';
    const {r,data}=await post('/api/auth/verify-email',{token:verifyToken});
    if(r.ok){$('#tokenTitle').textContent='Email verified';message($('#tokenMessage'),'Your workspace is ready. Redirecting to Vendor Watch…',true);setTimeout(()=>location.href='/vendors.html',700);}
    else{$('#tokenTitle').textContent='We could not verify this link';message($('#tokenMessage'),humanError(data.message||data.error));$('#tokenStatus').innerHTML='<a href="/auth.html">Return to sign in</a>';}
  }else{$('#tokenEyebrow').textContent='PASSWORD RESET';$('#tokenTitle').textContent='Choose a new password';$('#tokenMessage').textContent='This one-time link will be consumed when your password is changed.';$('#resetForm').hidden=false;}
}
$('#register').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),status=$('#registerStatus'),button=form.querySelector('button[type=submit]');
  if(button.disabled)return;
  if(passwordMismatch(fd.get('password'),fd.get('confirmation'))){message(status,'Your passwords do not match. Enter the same password in both fields.');form.elements.confirmation.focus();return;}
  button.disabled=true;message(status,'Creating your workspace…');
  const {r,data}=await post('/api/auth/register',{email:fd.get('email'),password:fd.get('password')});
  if(!r.ok){button.disabled=false;message(status,humanError(data.message||data.error));return;}
  button.textContent='Verification requested';
  const email=data.user?.email||fd.get('email');
  message(status,data.delivery==='sent'?`We sent a verification link to ${email}. Check your inbox and spam folder.`:`Your workspace is created. A verification email to ${email} is queued and will retry automatically.`,true);
};
$('#login').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),status=$('#loginStatus'),button=form.querySelector('button[type=submit]');
  if(button.disabled)return;button.disabled=true;message(status,'Signing in…');
  const {r,data}=await post('/api/auth/login',{email:fd.get('email'),password:fd.get('password')});button.disabled=false;
  if(r.ok){location.href='/vendors.html';return;}
  message(status,humanError(data.message||data.error));
  if(r.status===403&&data.error==='email_verification_required'){
    const resend=document.createElement('button');resend.type='button';resend.textContent='Resend verification email';resend.className='linkButton';
    resend.onclick=async()=>{resend.disabled=true;const result=await post('/api/auth/resend-verification',{email:fd.get('email')});message(status,result.r.ok?'If this address still needs verification, a new email has been requested. Check your inbox.':humanError(result.data.error));};status.append(resend);
  }
};
$('#forgotToggle').onclick=()=>{$('#recovery').hidden=false;$('#forgotToggle').hidden=true;$('#forgotForm input').focus();};
$('#forgotForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),status=$('#forgotStatus');if(button.disabled)return;button.disabled=true;message(status,'Requesting a reset link…');const {r,data}=await post('/api/auth/request-password-reset',{email:new FormData(form).get('email')});message(status,r.ok?'If a workspace uses this address, a password-reset email has been requested. Check your inbox and spam folder.':humanError(data.error),r.ok);button.disabled=false;};
$('#resetForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,fd=new FormData(form),status=$('#tokenStatus'),button=form.querySelector('button[type=submit]');
  if(button.disabled)return;
  if(passwordMismatch(fd.get('password'),fd.get('confirmation'))){message(status,'Your passwords do not match. Enter the same password in both fields.');form.elements.confirmation.focus();return;}
  button.disabled=true;message(status,'Changing password…');const {r,data}=await post('/api/auth/reset-password',{token:resetToken,password:fd.get('password')});
  if(!r.ok){button.disabled=false;message(status,humanError(data.message||data.error));return;}
  message(status,'Password changed. Previous sessions have been revoked. Redirecting to Vendor Watch…',true);setTimeout(()=>location.href='/vendors.html',700);
};
