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
  const sync=await context.request.post(base+'/api/sync');assert.equal(sync.status(),200);const initial=(await sync.json()).discovery;assert.ok(initial);
  const reused=await (await context.request.post(base+'/api/sync',{data:{force:true}})).json();assert.equal(reused.reused,true);assert.deepEqual(reused.discovery,initial);
  const data=await (await context.request.get(base+'/api/opportunities')).json();assert.ok(data.length);
  const summary={rawCandidates:2000,uniqueCandidates:1842,evaluated:1842,relevant:216,strong:48,retained:250,apiRequests:6,pages:6,searchHorizonDays:90,syncedAt:'2026-09-20T12:00:00Z',stale:false,stopReason:'quality_target'};
  for(const width of [360,390,430,768,980,1024,1100,1440])for(const state of ['unconfigured','naics','capabilities','populated','empty','error','stale','fresh','budget','explore-only','relevant-only','mixed','description-error']){
    await page.setViewportSize({width,height:1000});
    const configured=state!=='unconfigured',p=state==='unconfigured'?{}:state==='capabilities'?{...profile,naics:[]}:profile;
    const s=['unconfigured','naics','capabilities'].includes(state)?null:state==='empty'?{...summary,evaluated:0,relevant:0,strong:0,retained:0}: {...summary,stale:state==='stale'};
    const qualityState=['explore-only','relevant-only','mixed','description-error'].includes(state);
    const scores=state==='explore-only'?[45,40,30]:state==='relevant-only'?[63,55]:[82,63,45];
    const fixtures=scores.map(score=>({...data[0],id:'quality-'+score,title:'QA opportunity '+score,sourceUrl:'https://sam.gov/opp/qa/view',description:'',descriptionUrl:'https://api.sam.gov/desc/qa',requirements:[],enrichedAt:null,match:{score,reasons:score<55?['Set-aside appears compatible: small business']:['NAICS match: 115310'],risks:[],blocked:false}}));
    if(qualityState){s.relevant=scores.filter(x=>x>=55).length;s.strong=scores.filter(x=>x>=75).length;}
    if(state==='description-error')await page.route('**/api/health',async route=>{const response=await route.fetch();await route.fulfill({json:{...await response.json(),enrichment:'available'}});});
    await page.route('**/api/profile',route=>route.fulfill({json:p}));
    await page.route('**/api/discovery',route=>route.fulfill({json:{configured,mode:state==='capabilities'?'capabilities':configured?'naics':'unconfigured',summary:s,fresh:state==='fresh',refreshUnavailable:state==='budget'?{code:'discovery_global_budget_exhausted',retryAt:'2099-01-01T00:00:00Z'}:null}}));
    await page.route('**/api/opportunities',route=>route.fulfill({json:['unconfigured','empty'].includes(state)?[]:qualityState?fixtures:data}));
    await page.goto(base+'/app.html');await page.waitForFunction(()=>document.querySelector('[data-account-email]')?.textContent.includes('@'));
    if(!configured){assert.ok(await page.locator('#sync').isDisabled());assert.match(await page.locator('#profileLine').innerText(),/Set up your company profile/);}
    if(state==='capabilities')assert.match(await page.locator('#profileLine').innerText(),/Add NAICS/);
    if(state==='stale')assert.match(await page.locator('#pursuitStatus').innerText(),/cached/);
    if(state==='empty')assert.match(await page.locator('#pursuitStatus').innerText(),/No profile matches/);
    if(state==='populated')assert.equal(await page.locator('#scannedCount').innerText(),'1,842');
    if(s)assert.match(await page.locator('#lastSearched').innerText(),/^Last searched:/);
    if(state==='fresh')assert.match(await page.locator('#pursuitStatus').innerText(),/without another SAM.gov request/);
    if(state==='budget'){assert.ok(await page.locator('#sync').isDisabled());assert.match(await page.locator('#pursuitStatus').innerText(),/temporarily unavailable/);assert.equal(await page.locator('#scannedCount').innerText(),'1,842');}
    if(state==='error'){
      await page.route('**/api/sync',route=>route.fulfill({status:503,json:{error:'discovery_upstream_unavailable'}}));
      await page.locator('#sync').click();await page.getByText(/existing opportunities are unchanged/).waitFor();assert.ok(await page.locator('.card[data-id]').count());await page.unroute('**/api/sync');
    }
    if(['empty','explore-only'].includes(state)){
      await page.getByRole('heading',{name:'No relevant opportunities found right now.'}).waitFor();
      assert.equal(await page.locator('.card[data-id]').count(),0);
      assert.equal(await page.locator('.card.selected').count(),0);
      await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(output,`${width}-${state}-default.png`),fullPage:true});
      await page.getByRole('button',{name:'Explore lower-confidence results'}).click();
      assert.equal(await page.locator('.card.selected').count(),0);
      if(state==='explore-only'){
        assert.equal(await page.locator('.card[data-id]').count(),3);
        assert.equal(await page.locator('.card .score small').allTextContents().then(x=>x.every(t=>t==='Low relevance')),true);
        await page.locator('.card[data-id]').first().focus();await page.keyboard.press('Enter');
        await page.getByText('No strong business-profile match detected.',{exact:true}).waitFor();
        assert.equal(await page.locator('#detail .bigScore small').innerText(),'Low relevance');
      }
    }
    if(['mixed','relevant-only','description-error'].includes(state)){
      await page.locator('#detail .bigScore').waitFor();
      assert.equal(await page.locator('.card[data-id]').count(),2);
      assert.equal(await page.locator('.card.selected').getAttribute('data-id'),state==='relevant-only'?'quality-63':'quality-82');
      if(state==='mixed'){
        await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(output,`${width}-mixed-default.png`),fullPage:true});
        await page.locator('.filter[data-view="strong"]').click();assert.equal(await page.locator('.card[data-id]').count(),1);
        await page.locator('.filter[data-view="explore"]').click();assert.equal(await page.locator('.card[data-id]').count(),1);assert.equal(await page.locator('.card.selected').count(),0);
        await page.locator('.card[data-id]').click();await page.getByText('No strong business-profile match detected.',{exact:true}).waitFor();
        await page.locator('.filter[data-view="relevant"]').click();await page.locator('.card[data-id="quality-63"]').click();await page.locator('#detail h2').filter({hasText:'QA opportunity 63'}).waitFor();
        await page.route('**/api/sync',r=>r.fulfill({json:{reused:true}}));await page.locator('#sync').click();await page.waitForFunction(()=>document.querySelector('#sync').textContent==='Refresh opportunities');
        assert.equal(await page.locator('.card.selected').getAttribute('data-id'),'quality-63');await page.unroute('**/api/sync');
      }
      if(state==='description-error'){
        for(const code of ['rate_limited','temporarily_unavailable','not_found','configuration','malformed']){
          await page.route('**/api/opportunities/*/enrich',r=>r.fulfill({status:503,json:{error:'enrichment_'+code}}));
          await page.locator('#analyzeOfficial').click();await page.waitForFunction(()=>document.querySelector('#analyzeStatus').textContent.includes('Open official source'));
          assert.ok(await page.getByRole('link',{name:'Open official source'}).isVisible());
          assert.equal(await page.locator('.card[data-id]').count(),2);
          assert.doesNotMatch(await page.locator('#analyzeStatus').innerText(),/enrichment_|api_key/);
          await page.unroute('**/api/opportunities/*/enrich');
        }
      }
    }
    for(const filter of await page.locator('.filter').all())assert.ok((await filter.boundingBox()).height>=44);
    const mobile=width<=1100,trigger=page.locator(mobile?'#mobileToggle':'#accountToggle');
    assert.ok((await trigger.boundingBox()).height>=44);assert.ok((await page.locator('#sync').boundingBox()).height>=44);
    assert.equal(await page.locator('#accountToggle').isVisible(),!mobile);assert.equal(await page.locator('.shellNav').isVisible(),!mobile);
    await trigger.focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.ok(await trigger.evaluate(el=>el===document.activeElement));
    const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(scroll<=width,`${state}: ${scroll} > ${width}`);
    for(const score of await page.locator('.score,.bigScore').all()){const box=await score.boundingBox(),label=await score.locator('small').boundingBox();assert.ok(label.x>=box.x&&label.x+label.width<=box.x+box.width+1&&label.y+label.height<=box.y+box.height+1,'Quality label must fit its score badge');}
    await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(50);
    await page.screenshot({path:join(output,`${width}-${state}.png`),fullPage:true});results.push({width,state,scroll});
    await page.unroute('**/api/profile');await page.unroute('**/api/discovery');await page.unroute('**/api/opportunities');if(state==='description-error')await page.unroute('**/api/health');
  }
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({ok:true,results,errors},null,2));console.log(JSON.stringify({ok:true,checks:results.length,output,errors}));
}finally{await browser?.close();child.kill('SIGTERM');await new Promise(r=>{const t=setTimeout(r,2000);child.once('exit',()=>{clearTimeout(t);r();});});await rm(root,{recursive:true,force:true});}
