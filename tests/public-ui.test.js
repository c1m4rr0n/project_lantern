import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path){return readFile(new URL(`../public/${path}`,import.meta.url),'utf8');}

test('customer-facing UI hides internal release labels and uses paid-beta language',async()=>{
  for(const file of ['index.html','pricing.html','vendors.html','app.html']){
    const body=await read(file);
    const visibleCopy=body.replace(/\?v=rc\d+/gi,'');
    assert.equal(/RC\d/i.test(visibleCopy),false,`${file} exposes an internal RC label outside asset versioning`);
  }
  assert.match(await read('index.html'),/Start free trial/i);
});

test('verified users are routed to Vendor Watch instead of the optional pursuit profile',async()=>{
  const auth=await read('auth.js');
  assert.match(auth,/Redirecting to Vendor Watch/);
  assert.match(auth,/location\.href='\/vendors\.html'/);
});

test('optional pursuit onboarding surfaces actionable validation errors',async()=>{
  const onboarding=await read('onboarding.html');
  assert.match(onboarding,/COMPANY PROFILE/);
  assert.match(onboarding,/Pursuit Watch/);
  assert.match(onboarding,/optional for Vendor Watch/i);
  assert.match(onboarding,/monitor vendors without NAICS/i);
  assert.match(onboarding,/Add at least one NAICS code or capability/);
  assert.match(onboarding,/throw new Error\(data\.message\|\|data\.error/);
  assert.match(onboarding,/catch\(error\) \{status\.textContent=humanError\(error/);
});

test('every public HTML page declares the ExcluSignal favicon',async()=>{
  for(const file of ['index.html','pricing.html','vendors.html','app.html','auth.html','onboarding.html','digest.html']){
    assert.match(await read(file),/\/favicon\.svg/,`${file} is missing the favicon`);
  }
});

test('workspace navigation identifies the active page accessibly',async()=>{
  const pages={
    'vendors.html':'/vendors.html',
    'app.html':'/app.html',
    'digest.html':'/digest.html',
    'onboarding.html':'/onboarding.html',
    'pricing.html':'/pricing.html'
  };
  for(const [file,path] of Object.entries(pages)){
    const body=await read(file);
    assert.match(body,/data-app-shell/,`${file} must use the shared shell`);
    const {navigation}=await import('../public/polish-model.js');
    assert.ok(navigation.some(([href])=>href===path));
  }
  assert.match(await read('ui.js'),/aria-current="page"/);
  assert.match(await read('ui.js'),/aria-label="Workspace navigation"/);
});

test('Vendor Watch keeps primary screening actions in context and exposes inline status',async()=>{
  const html=await read('vendors.html');
  const script=await read('vendors.js');
  const header=html.match(/<header[\s\S]*?<\/header>/)?.[0]||'';
  assert.doesNotMatch(header,/id="screenAll"/,`Screen all should not compete with global navigation`);
  assert.match(html,/class="vendorPanelTools"[\s\S]*id="screenAll"/,`Screen all should live with the watchlist`);
  assert.match(html,/id="screenAllStatus"[^>]*aria-live="polite"/,`Screening results need an accessible live region`);
  assert.match(html,/id="billingBanner" class="keyNotice planUsageStrip"/,`Plan usage should have a dedicated presentation`);
  assert.match(html,/id="snapshotDate">Not screened yet</,`The initial source state should be explicit`);
  assert.match(script,/meta\.sourceDate\|\|'Not screened yet'/,`The source fallback should remain explicit after rendering`);
  assert.doesNotMatch(script,/alert\(`Screened /,`Bulk-screening results should render inline instead of interrupting the user`);
});

test('responsive workspace styles keep mobile navigation and controls compact',async()=>{
  const css=await read('styles.css');
  const html=await read('vendors.html');
  const polish=await read('polish.css');
  assert.match(polish,/\.shellNav,\.shellAccount\{display:none\}/,`Mobile navigation must use a disclosure, not squeezed desktop links`);
  assert.ok(html.indexOf('detail vendorPanel')<html.indexOf('detail vendorAdd'),`The watchlist should precede its secondary add form in visual and reading order`);
  assert.match(css,/\.vendorHero h1\{font-size:clamp\(29px,8\.8vw,36px\)/,`The mobile Vendor Watch headline should use the compact scale`);
  assert.match(css,/min-height:42px;padding:9px 10px;font-size:16px/,`Mobile fields should be compact without triggering browser zoom`);
});
