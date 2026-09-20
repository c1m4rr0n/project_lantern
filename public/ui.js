import { navigation } from './polish-model.js';
export function mountShell() {
  const root=document.querySelector('[data-app-shell]');
  if(!root||root.dataset.mounted)return;
  root.dataset.mounted='true';root.className='appShell';
  const section=navigation.find(([path])=>path===location.pathname)?.[1]||'Workspace settings';
  const links=navigation.map(([path,label])=>`<a href="${path}" ${path===location.pathname?'aria-current="page"':''}>${label}</a>`).join('');
  const settings='<a href="/account.html">Workspace settings</a><a href="/account.html#profile">Profile &amp; data</a><a href="/pricing.html">Plan &amp; billing</a>';
  root.innerHTML=`<a class="shellBrand" href="/vendors.html"><span class="mark">ES</span><strong>ExcluSignal</strong></a><span class="shellSection">${section}</span><nav class="shellNav" aria-label="Workspace navigation">${links}</nav><div class="shellAccount"><a id="guestAuth" href="/auth.html">Sign in</a><button id="accountToggle" type="button" aria-expanded="false" aria-controls="accountMenu" aria-label="Open workspace settings" hidden><span id="accountAvatar">E</span><span>Workspace</span> ▾</button><div id="accountMenu" class="shellMenu" hidden><p class="shellIdentity" data-account-email></p>${settings}<button type="button" data-logout>Sign out</button></div></div><button id="mobileToggle" type="button" aria-expanded="false" aria-controls="mobileMenu">Menu</button><div id="mobileMenu" class="shellMobile" hidden><p class="shellIdentity" data-account-email></p><nav aria-label="Mobile workspace navigation">${links}</nav><div data-account-links hidden>${settings}<button type="button" data-logout>Sign out</button></div><a data-guest-link href="/auth.html">Sign in</a></div>`;
  for(const [buttonId,panelId] of [['accountToggle','accountMenu'],['mobileToggle','mobileMenu']]){
    const button=root.querySelector('#'+buttonId),panel=root.querySelector('#'+panelId);
    const close=(focus=false)=>{panel.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
    button.onclick=()=>{const open=panel.hidden;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('a,button')?.focus();};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close(true);});
    document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!button.contains(e.target))close();});
    root.addEventListener('focusout',()=>queueMicrotask(()=>{if(!panel.hidden&&!panel.contains(document.activeElement)&&document.activeElement!==button)close();}));
    window.addEventListener('resize',()=>close());
  }
  const main=document.querySelector('main');if(main&&!document.querySelector('.skipLink')){main.id||='mainContent';main.tabIndex=-1;const skip=document.createElement('a');skip.className='skipLink';skip.href='#'+main.id;skip.textContent='Skip to content';document.body.prepend(skip);}
}
export function setAccountIdentity(payload) {
  mountShell();const email=String((payload?.user||payload)?.email||'');
  document.querySelectorAll('[data-account-email]').forEach(el=>el.textContent=email||'Guest');
  const toggle=document.querySelector('#accountToggle');if(toggle){toggle.hidden=!email;toggle.setAttribute('aria-label',`Workspace settings for ${email}`);}
  const avatar=document.querySelector('#accountAvatar');if(avatar)avatar.textContent=(email[0]||'E').toUpperCase();
  document.querySelectorAll('#guestAuth,[data-guest-link]').forEach(el=>el.hidden=Boolean(email));
  document.querySelectorAll('[data-account-links]').forEach(el=>el.hidden=!email);
  const profile=document.querySelector('#profileEmail');if(profile)profile.textContent=email;
}
export async function getAccount({required=true}={}) {
  mountShell();const response=await fetch('/api/auth/me');
  if(response.status===401){if(required)location.href='/auth.html';return null;}
  if(!response.ok)throw new Error('Could not load your workspace. Try again.');
  const payload=await response.json();setAccountIdentity(payload);return payload;
}
export function bindLogout(){
  document.querySelectorAll('[data-logout]').forEach(button=>{
    if(button.dataset.boundLogout)return;button.dataset.boundLogout='true';
    button.onclick=async()=>{button.disabled=true;try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw new Error();location.href='/auth.html';}catch{button.textContent='Could not sign out. Try again';button.disabled=false;}};
  });
}
export async function initAccount(options={}){const account=await getAccount(options);if(account)bindLogout();return account;}
if(typeof document!=='undefined')mountShell();
