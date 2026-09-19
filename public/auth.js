const $=s=>document.querySelector(s);
async function post(path,payload){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));return {r,data};}
function message(el,text,good=false){el.textContent=text;el.classList.toggle('successText',good);}

const params=new URLSearchParams(location.search);
const verifyToken=params.get('verify');
const resetToken=params.get('reset');
if (verifyToken || resetToken) history.replaceState(null,'','/auth.html');

if (verifyToken || resetToken) {
  $('#standardAuth').hidden=true; $('#recovery').hidden=true; $('#tokenFlow').hidden=false;
  if (verifyToken) {
    $('#tokenEyebrow').textContent='EMAIL VERIFICATION'; $('#tokenTitle').textContent='Verifying your email…';
    const {r,data}=await post('/api/auth/verify-email',{token:verifyToken});
    if (r.ok) { $('#tokenTitle').textContent='Email verified'; message($('#tokenMessage'),'Your workspace is ready. Redirecting to Vendor Watch…',true); setTimeout(()=>location.href='/vendors.html?welcome=1',700); }
    else { $('#tokenTitle').textContent='This verification link is no longer valid'; message($('#tokenMessage'),'Request a new verification email from the sign-in page.'); $('#tokenStatus').innerHTML='<a href="/auth.html">Return to sign in</a>'; }
  } else {
    $('#tokenEyebrow').textContent='PASSWORD RESET'; $('#tokenTitle').textContent='Choose a new password'; $('#tokenMessage').textContent='This one-time link will be consumed when the password is changed.'; $('#resetForm').hidden=false;
  }
}

$('#register').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,status=$('#registerStatus'),fd=new FormData(form),button=form.querySelector('button');message(status,'Creating workspace…');button.disabled=true;button.textContent='Sending verification…';const {r,data}=await post('/api/auth/register',{email:fd.get('email'),password:fd.get('password')});if(!r.ok){button.disabled=false;button.textContent='Create workspace →';message(status,data.message||data.error||'Request failed');return;}button.textContent='Verification email sent ✓';message(status,data.delivery==='sent'?'Verification email sent. It usually arrives within a minute. Check spam or promotions if it is not in your inbox.':'Workspace created. Email delivery is queued and will retry automatically if the provider is temporarily unavailable.',true);status.scrollIntoView({behavior:'smooth',block:'center'});};

$('#login').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,status=$('#loginStatus'),fd=new FormData(form);message(status,'Signing in…');const email=fd.get('email');const {r,data}=await post('/api/auth/login',{email,password:fd.get('password')});if(r.ok){location.href='/vendors.html';return;}if(r.status===403&&data.error==='email_verification_required'){message(status,'Email verification is required.');const resend=document.createElement('button');resend.type='button';resend.className='linkButton';resend.textContent='Resend verification email';resend.onclick=async()=>{resend.disabled=true;resend.textContent='Sending…';const {r:rr,data:rd}=await post('/api/auth/resend-verification',{email});if(rr.ok){resend.textContent=rd.delivery==='sent'?'Verification email sent ✓':'Verification queued ✓';message(status,rd.delivery==='sent'?'A new verification email was sent. Check your inbox and spam folder.':'A new verification email is queued and will retry automatically.',true);}else{resend.disabled=false;resend.textContent='Resend verification email';message(status,rd.message||rd.error||'Could not resend verification email.');}};status.append(document.createElement('br'),resend);return;}message(status,data.message||data.error||'Sign in failed');};

$('#forgotToggle').onclick=()=>{$('#recovery').hidden=false;$('#forgotToggle').hidden=true;};
$('#forgotForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,fd=new FormData(form),status=$('#forgotStatus'),button=form.querySelector('button');button.disabled=true;button.textContent='Sending reset email…';message(status,'Requesting reset…');const {r,data}=await post('/api/auth/request-password-reset',{email:fd.get('email')});if(r.ok){button.textContent='Reset email sent ✓';message(status,data.message||'If that account exists, the reset email was sent. Check your inbox now.',true);status.scrollIntoView({behavior:'smooth',block:'center'});}else{button.disabled=false;button.textContent='Send reset link →';message(status,data.message||data.error||'Request failed');}};

$('#resetForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),status=$('#tokenStatus');message(status,'Changing password…');const {r,data}=await post('/api/auth/reset-password',{token:resetToken,password:fd.get('password')});if(!r.ok){message(status,data.message||data.error||'Reset failed');return;}message(status,'Password changed. Previous sessions have been revoked. Redirecting…',true);setTimeout(()=>location.href='/vendors.html',700);};
