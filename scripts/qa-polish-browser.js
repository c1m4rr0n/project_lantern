// Optional local browser QA. Not part of runtime; never accepts a remote base URL.
// Supply PLAYWRIGHT_MODULE when Playwright is provided by the workstation, not this package.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=await mkdtemp(join(tmpdir(),'lantern-rc20-browser-')),port=24000+process.pid%10000,base=`http://127.0.0.1:${port}`;
const output=process.env.RC20_QA_OUTPUT?resolve(process.env.RC20_QA_OUTPUT):await mkdtemp(join(tmpdir(),'lantern-rc20-evidence-'));
await mkdir(output,{recursive:true});
const child=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,NODE_ENV:'development',PORT:String(port),PUBLIC_BASE_URL:base,DATA_ROOT:root,STORAGE_DRIVER:'sqlite',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EXCLUSION_PROVIDER:'mock',EMAIL_PROVIDER:'console',BILLING_PROVIDER:'mock',SCHEDULER_ENABLED:'false',COOKIE_SECURE:'false',SESSION_SECRET:randomBytes(32).toString('hex'),AUTH_RATE_LIMIT:'200',PUBLIC_LAUNCH_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stdout.on('data',()=>{});child.stderr.on('data',c=>diagnostics+=c);
let browser;const errors=[],results=[],profileChecks=[];
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/ready')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,diagnostics);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const email='qa-long-workspace-identity-for-responsive-validation@example.test',password='local QA password 12345';
  assert.equal((await context.request.post(base+'/api/auth/register',{data:{email,password}})).status(),201);
  let token;for(const file of await readdir(join(root,'outbox'))){const m=JSON.parse(await readFile(join(root,'outbox',file),'utf8'));if(m.to===email)token=new URL(m.payload.link).searchParams.get('verify');}
  assert.equal((await context.request.post(base+'/api/auth/verify-email',{data:{token}})).status(),200);
  await context.request.post(base+'/api/profile',{data:{name:'Local QA contractor',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:[],negativeKeywords:[],hardBlockers:[]}});
  for(let i=0;i<23;i++)assert.equal((await context.request.post(base+'/api/vendors',{data:{legalName:`QA Vendor ${i} — long supplier name for responsive evidence validation`}})).status(),201);
  await page.goto(base+'/');await page.waitForURL('**/vendors.html');await page.waitForFunction(()=>document.querySelector('#vendorCount')?.textContent==='23');
  await page.locator('[data-screen]').first().click();await page.getByText('Run screening again',{exact:true}).first().waitFor();
  const first=(await (await context.request.get(base+'/api/vendors')).json())[0];
  const history=await (await context.request.get(`${base}/api/vendors/${first.id}/screenings`)).json();assert.equal(history.screenings.length,1);
  await page.locator('[data-delete]').first().click();await page.locator('dialog').waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cancel');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Archive vendor');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cancel');
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
  await page.locator('[data-delete]').first().click();await page.locator('dialog').getByRole('button',{name:'Archive vendor',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#vendorCount').textContent==='22');
  await page.locator('#loadArchive').click();await page.getByRole('button',{name:'Restore vendor',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#vendorCount').textContent==='23');assert.equal((await (await context.request.get(`${base}/api/vendors/${first.id}/screenings`)).json()).screenings.length,1);
  const spare=await (await context.request.post(base+'/api/vendors',{data:{legalName:'Archived capacity test'}})).json();
  assert.equal((await context.request.delete(`${base}/api/vendors/${spare.id}`)).status(),200);
  await page.locator('#csvFile').setInputFiles({name:'review.csv',mimeType:'text/csv',buffer:Buffer.from('legal name,cage\n"QA Import, One",\nQA Import Two,\nQA Import Three,\nQA Import Two,\nInvalid,TOOLONG')});
  await page.locator('#csvPreview').click();await page.locator('#csvReview').waitFor();assert.match(await page.locator('#csvCapacity').innerText(),/2 slots available · 3 selected/);assert.ok(await page.locator('#csvCommit').isDisabled());
  await page.screenshot({path:join(output,'import-desktop.png'),fullPage:true});
  await page.locator('#csvRows input').last().uncheck();await page.locator('#csvCommit').click();await page.locator('dialog').getByRole('button',{name:'Import 2 vendors',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#vendorCount').textContent==='25');
  assert.equal(await page.locator('#csvReview').isVisible(),false);
  await page.getByRole('button',{name:'Restore vendor',exact:true}).click();await page.getByText('Cannot restore vendor',{exact:true}).waitFor();
  assert.match(await page.locator('#archiveList').innerText(),/no available vendor slots/);assert.doesNotMatch(await page.locator('#csvStatus').innerText(),/Cannot restore/);
  assert.equal((await (await context.request.get(base+'/api/vendors')).json()).length,25);
  await page.locator('[name=legalName]').fill('Over capacity');await page.locator('#vendorForm button[type=submit]').click();await page.getByText('Vendor limit reached',{exact:true}).waitFor();assert.ok(page.url().endsWith('/vendors.html'));
  await page.locator('#csvFile').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('name\n"bad')});await page.locator('#csvPreview').click();await page.getByText(/unclosed quotation mark/).waitFor();
  // Keep a populated review for mobile/table inspection without committing anything.
  await page.locator('#csvFile').setInputFiles({name:'review.csv',mimeType:'text/csv',buffer:Buffer.from('name,cage\nNew vendor,\nRepeated,\nRepeated,\nInvalid,TOOLONG')});await page.locator('#csvPreview').click();await page.locator('#csvReview').waitFor();
  for(const width of [360,390,430,768,980,1024,1100,1440]){
    await page.setViewportSize({width,height:1000});
    for(const path of ['/vendors.html','/app.html','/digest.html','/onboarding.html','/pricing.html?reason=limit','/account.html']){
      if(!path.startsWith('/vendors'))await page.goto(base+path);else if(!page.url().endsWith('/vendors.html')){await page.goto(base+path);await page.waitForFunction(()=>document.querySelector('#vendorCount')?.textContent==='25');}
      await page.locator('[data-account-email]').first().waitFor({state:'attached'});
      await page.waitForFunction(()=>document.querySelector('[data-account-email]')?.textContent.includes('@'));
      if(path==='/account.html'){
        assert.equal(await page.locator('.shellSection').textContent(),'Settings');
        for(const link of await page.locator('.productAction').all()){assert.ok((await link.boundingBox()).height>=44);assert.equal(await link.evaluate(el=>getComputedStyle(el).textDecorationLine),'none');}
        await page.screenshot({path:join(output,`${width}-settings-viewport.png`)});
      }
      const shell=page.locator('.appShell'),mobile=width<=1100,trigger=page.locator(mobile?'#mobileToggle':'#accountToggle'),menu=page.locator(mobile?'#mobileMenu':'#accountMenu');
      assert.doesNotMatch(await shell.innerText(),/@|Sign out/);
      if(mobile){assert.equal(await page.locator('#accountToggle').isVisible(),false);assert.equal(await page.locator('.shellNav').isVisible(),false);}
      else{
        assert.match((await trigger.innerText()).replace(/\s/g,''),/^Q▾$/);
        const alignment=await page.evaluate(()=>{const nav=document.querySelector('.shellNav').getBoundingClientRect(),account=document.querySelector('#accountToggle').getBoundingClientRect(),link=document.querySelector('.shellNav a').getBoundingClientRect();return {center:nav.x+nav.width/2,viewport:innerWidth,accountHeight:account.height,navHeight:link.height,accountRight:account.right,font:getComputedStyle(document.querySelector('#accountAvatar')).fontFamily,navFont:getComputedStyle(document.querySelector('.shellNav a')).fontFamily};});
        assert.ok(Math.abs(alignment.center-width/2)<1);assert.ok(Math.abs(alignment.accountHeight-alignment.navHeight)<1);assert.equal(alignment.font,alignment.navFont);assert.ok(width-alignment.accountRight<=25);
      }
      assert.ok((await trigger.boundingBox()).height>=44);assert.ok((await trigger.boundingBox()).width>=44);
      if(path==='/vendors.html')await shell.screenshot({path:join(output,`${width}-shell-closed.png`)});
      await trigger.focus();await page.keyboard.press('Enter');assert.ok(await menu.isVisible());
      assert.ok(await menu.evaluate(el=>el.contains(document.activeElement)));await page.keyboard.press('Tab');assert.ok(await menu.evaluate(el=>el.contains(document.activeElement)));
      assert.ok(await menu.getByText(email,{exact:true}).isVisible());assert.ok(await menu.getByRole('button',{name:'Sign out',exact:true}).isVisible());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(path==='/vendors.html')await page.screenshot({path:join(output,`${width}-shell-open.png`)});
      await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.ok(await trigger.evaluate(el=>el===document.activeElement));
      await trigger.click();await page.mouse.click(2,3);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
      if(path==='/vendors.html'){
        await page.locator('#csvFile').setInputFiles({name:'review.csv',mimeType:'text/csv',buffer:Buffer.from('name,cage\nNew vendor,\nRepeated,\nRepeated,\nInvalid,TOOLONG')});await page.locator('#csvPreview').click();await page.locator('#csvReview').waitFor();
        await page.locator('#csvReview').screenshot({path:join(output,`${width}-import-review.png`)});
        await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(output,`${width}-vendor-viewport.png`)});
      }
      const overflow=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.className)}));
      results.push({width,path,...overflow});assert.ok(overflow.scroll<=width+1,JSON.stringify(results.at(-1)));
      if(width<=1100){await page.locator('#mobileToggle').click();assert.ok(await page.locator('#mobileMenu').isVisible());assert.match(await page.locator('#mobileMenu [data-account-email]').innerText(),/qa-long/);assert.ok((await page.locator('#mobileMenu').boundingBox()).width<=width);await page.keyboard.press('Escape');assert.equal(await page.locator('#mobileToggle').getAttribute('aria-expanded'),'false');}
      else{await page.locator('#accountToggle').click();assert.ok(await page.locator('#accountMenu').isVisible());await page.keyboard.press('Escape');}
      await page.screenshot({path:join(output,`${width}-${path.split('?')[0].slice(1)}.png`),fullPage:true});
      if(path==='/app.html'){
        const cases=[['empty',{},'Set up your company profile to discover relevant federal opportunities.'],['capabilities',{capabilities:['cloud','security']},'Matching your capabilities: cloud · security'],['name',{name:'Example LLC'},'Set up your company profile to discover relevant federal opportunities.'],['complete',{name:'Example Federal Services with a longer company name',naics:['541512'],capabilities:['cloud','security']},'Matching for Example Federal Services with a longer company name: cloud · security']];
        for(const [label,profile,expected]of cases){
          const configured=Boolean(profile.naics?.length||profile.capabilities?.length),mode=profile.naics?.length?'naics':configured?'capabilities':'unconfigured';
          await page.route('**/api/discovery',route=>route.fulfill({json:{configured,mode,summary:null}}));
          await page.route('**/api/profile',route=>route.fulfill({json:profile}));await page.goto(base+'/app.html');await page.waitForFunction(text=>document.querySelector('#profileLine')?.textContent.startsWith(text),expected);
          assert.equal(await page.locator('#profileLine').innerText(),expected+(!configured?' Set up profile →':mode==='capabilities'?' Add NAICS for better discovery →':''));
          if(label==='empty')assert.equal(await page.locator('#profileLine a').getAttribute('href'),'/onboarding.html');
          assert.equal(await page.locator('.pursuitHeading #sync').count(),1);const sync=await page.locator('#sync').boundingBox();assert.ok(sync.height>=44&&sync.width<230);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));profileChecks.push({width,profile:label});
          await page.screenshot({path:join(output,`${width}-pursuit-${label}.png`)});await page.unroute('**/api/profile');await page.unroute('**/api/discovery');
        }
      }
    }
  }
  await page.goto(`${base}/api/vendors/${first.id}/report`);assert.match(await page.locator('body').innerText(),/No matching exclusion records/);await page.screenshot({path:join(output,'report.png'),fullPage:true});await page.pdf({path:join(output,'report.pdf'),format:'A4'});
  const guest=await browser.newContext(),auth=await guest.newPage();auth.on('pageerror',e=>errors.push(e.message));
  for(const width of [360,390,430,768,980,1024,1100,1440]){await auth.setViewportSize({width,height:1000});for(const path of ['/','/auth.html']){await auth.goto(base+path);const scroll=await auth.evaluate(()=>document.documentElement.scrollWidth);assert.ok(scroll<=width+1,`${path} overflow at ${width}: ${scroll}`);results.push({width,path,scroll});await auth.screenshot({path:join(output,`${width}-${path==='/'?'landing':'auth'}.png`),fullPage:true});}}
  await auth.locator('#register [name=email]').fill('mismatch@example.test');await auth.locator('#register [name=password]').fill(password);await auth.locator('#register [name=confirmation]').fill('a different password');let registerPosts=0;auth.on('request',r=>{if(r.url().endsWith('/api/auth/register'))registerPosts++;});await auth.locator('#register button[type=submit]').click();assert.match(await auth.locator('#registerStatus').innerText(),/do not match/);assert.equal(registerPosts,0);
  await auth.locator('#register .passwordToggle').first().click();assert.equal(await auth.locator('#register [name=password]').getAttribute('type'),'text');
  await auth.goto(base+'/auth.html?reset=local-invalid-token');await auth.locator('#resetForm [name=password]').fill(password);await auth.locator('#resetForm [name=confirmation]').fill('another password');let resetPosts=0;auth.on('request',r=>{if(r.url().endsWith('/api/auth/reset-password'))resetPosts++;});await auth.locator('#resetForm button[type=submit]').click();assert.match(await auth.locator('#tokenStatus').innerText(),/do not match/);assert.equal(resetPosts,0);
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({ok:true,checks:results,profileChecks,consoleErrors:errors},null,2));console.log(JSON.stringify({ok:true,output,responsiveChecks:results.length,profileChecks:profileChecks.length,consoleErrors:errors}));
}finally{await browser?.close();child.kill('SIGTERM');await new Promise(r=>{const timer=setTimeout(r,2000);child.once('exit',()=>{clearTimeout(timer);r();});});await rm(root,{recursive:true,force:true});}
