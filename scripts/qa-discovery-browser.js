// Optional workstation Playwright QA: only disposable localhost data, no live SAM or billing.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,readdir,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=await mkdtemp(join(tmpdir(),'rc21-browser-')),port=25000+process.pid%10000,base=`http://127.0.0.1:${port}`;
const output=process.env.RC21_QA_OUTPUT?resolve(process.env.RC21_QA_OUTPUT):await mkdtemp(join(tmpdir(),'rc21-evidence-'));
await mkdir(output,{recursive:true});
const child=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,NODE_ENV:'development',PORT:String(port),DATA_ROOT:root,PUBLIC_BASE_URL:base,STORAGE_DRIVER:'sqlite',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EXCLUSION_PROVIDER:'mock',EMAIL_PROVIDER:'console',BILLING_PROVIDER:'mock',SCHEDULER_ENABLED:'false',COOKIE_SECURE:'false',SESSION_SECRET:randomBytes(32).toString('hex'),AUTH_RATE_LIMIT:'200'},stdio:['ignore','pipe','pipe']});
let diagnostics='',browser;child.stdout.on('data',()=>{});child.stderr.on('data',x=>diagnostics+=x);
const results=[],errors=[];
try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/ready')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,diagnostics);
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const email='rc21-responsive-long-company-identity@example.test';
  assert.equal((await context.request.post(base+'/api/auth/register',{data:{email,password:'local browser QA password 123'}})).status(),201);
  let token;for(const file of await readdir(join(root,'outbox'))){const mail=JSON.parse(await readFile(join(root,'outbox',file),'utf8'));if(mail.to===email)token=new URL(mail.payload.link).searchParams.get('verify');}
  assert.equal((await context.request.post(base+'/api/auth/verify-email',{data:{token}})).status(),200);
  assert.equal((await context.request.post(base+'/api/sync')).status(),409);
  assert.equal((await (await context.request.get(base+'/api/discovery')).json()).configured,false);
  const profile={name:'Example Federal Cloud Services',naics:['541512'],capabilities:['cloud'],regions:[],setAsides:[],negativeKeywords:[],hardBlockers:[]};
  assert.equal((await context.request.post(base+'/api/profile',{data:profile})).status(),200);
  const sync=await context.request.post(base+'/api/sync');assert.equal(sync.status(),200);assert.ok((await sync.json()).discovery);
  const data=await (await context.request.get(base+'/api/opportunities')).json();assert.ok(data.length);
  const summary={rawCandidates:2000,uniqueCandidates:1842,evaluated:1842,relevant:216,strong:48,retained:250,apiRequests:6,pages:6,searchHorizonDays:90,syncedAt:'2026-09-20T12:00:00Z',stale:false,stopReason:'quality_target'};
  for(const width of [360,390,430,768,980,1024,1100,1440])for(const state of ['unconfigured','naics','capabilities','populated','empty','error','stale']){
    await page.setViewportSize({width,height:1000});
    const configured=state!=='unconfigured',p=state==='unconfigured'?{}:state==='capabilities'?{...profile,naics:[]}:profile;
    const s=['unconfigured','naics','capabilities'].includes(state)?null:state==='empty'?{...summary,evaluated:0,relevant:0,strong:0,retained:0}: {...summary,stale:state==='stale'};
    await page.route('**/api/profile',route=>route.fulfill({json:p}));
    await page.route('**/api/discovery',route=>route.fulfill({json:{configured,mode:state==='capabilities'?'capabilities':configured?'naics':'unconfigured',summary:s}}));
    await page.route('**/api/opportunities',route=>route.fulfill({json:['unconfigured','empty'].includes(state)?[]:data}));
    await page.goto(base+'/app.html');await page.waitForFunction(()=>document.querySelector('[data-account-email]')?.textContent.includes('@'));
    if(!configured){assert.ok(await page.locator('#sync').isDisabled());assert.match(await page.locator('#profileLine').innerText(),/Set up your company profile/);}
    if(state==='capabilities')assert.match(await page.locator('#profileLine').innerText(),/Add NAICS/);
    if(state==='stale')assert.match(await page.locator('#pursuitStatus').innerText(),/cached/);
    if(state==='empty')assert.match(await page.locator('#pursuitStatus').innerText(),/No profile matches/);
    if(state==='populated')assert.equal(await page.locator('#scannedCount').innerText(),'1,842');
    if(state==='error'){
      await page.route('**/api/sync',route=>route.fulfill({status:503,json:{error:'discovery_upstream_unavailable'}}));
      await page.locator('#sync').click();await page.getByText(/existing opportunities are unchanged/).waitFor();assert.ok(await page.locator('.card[data-id]').count());await page.unroute('**/api/sync');
    }
    const mobile=width<=1100,trigger=page.locator(mobile?'#mobileToggle':'#accountToggle');
    assert.ok((await trigger.boundingBox()).height>=44);assert.ok((await page.locator('#sync').boundingBox()).height>=44);
    assert.equal(await page.locator('#accountToggle').isVisible(),!mobile);assert.equal(await page.locator('.shellNav').isVisible(),!mobile);
    await trigger.focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.ok(await trigger.evaluate(el=>el===document.activeElement));
    const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(scroll<=width,`${state}: ${scroll} > ${width}`);
    await page.screenshot({path:join(output,`${width}-${state}.png`),fullPage:true});results.push({width,state,scroll});
    await page.unroute('**/api/profile');await page.unroute('**/api/discovery');await page.unroute('**/api/opportunities');
  }
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({ok:true,results,errors},null,2));console.log(JSON.stringify({ok:true,checks:results.length,output,errors}));
}finally{await browser?.close();child.kill('SIGTERM');await new Promise(r=>{const t=setTimeout(r,2000);child.once('exit',()=>{clearTimeout(t);r();});});await rm(root,{recursive:true,force:true});}
