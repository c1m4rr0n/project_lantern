import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {humanError,passwordMismatch,capacityCopy,importCapacity,classifyImport,sourceLabel,pursuitProfile} from '../public/polish-model.js';
import {screeningReport} from '../src/services/vendor-export.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('Pursuit profile copy handles empty, capabilities-only, name-only and complete profiles',()=>{
  assert.deepEqual(pursuitProfile(),{text:'Company profile not configured.',setup:true});
  assert.deepEqual(pursuitProfile({name:' ',capabilities:['  ']}),{text:'Company profile not configured.',setup:true});
  assert.deepEqual(pursuitProfile({capabilities:['cloud','security']}),{text:'Matching your capabilities: cloud · security',setup:false});
  assert.deepEqual(pursuitProfile({name:'Example LLC'}),{text:'Matching for Example LLC',setup:false});
  assert.deepEqual(pursuitProfile({name:'Example LLC',capabilities:['cloud','security']}),{text:'Matching for Example LLC: cloud · security',setup:false});
});
test('Android polish keeps Settings short and moves sync/settings actions into product context',async()=>{
  assert.match(await read('public/ui.js'),/\?\.\[1\]\|\|'Settings'/);
  const app=await read('public/app.html');assert.doesNotMatch(app,/class="pageActions"/);
  assert.match(app,/<section class="hero[^>]*pursuitHero"[\s\S]*id="sync" class="secondaryButton"[\s\S]*<\/section>/);
  const account=await read('public/account.html');assert.match(account,/class="productAction" href="\/onboarding.html">Edit company profile →/);assert.match(account,/class="productAction" href="\/pricing.html">View plan &amp; billing →/);
});
for(const action of ['register','resetForm'])test(`${action}: mismatch prevents POST and retains form`,async()=>{
  const elements=new Map();const element=key=>{if(!elements.has(key))elements.set(key,{classList:{toggle(){}},hidden:false,textContent:'',innerHTML:'',querySelector:()=>({disabled:false}),elements:{confirmation:{focus(){}}}});return elements.get(key);};
  let posts=0;const source=(await read('public/auth.js')).replace(/^import .*;\r?\n/gm,'');
  const context=vm.createContext({humanError,passwordMismatch,document:{querySelector:element,querySelectorAll:()=>[]},location:{search:action==='resetForm'?'?reset=local-only':''},history:{replaceState(){}},URLSearchParams,FormData:class{get(key){return key==='password'?'a long password':key==='confirmation'?'different password':'qa@example.test';}},fetch:async()=>{posts++;throw new Error('must not POST');}});
  await vm.runInContext(`(async()=>{${source}})()`,context);
  const form=element('#'+action);await form.onsubmit({preventDefault(){},currentTarget:form});
  assert.equal(posts,0);assert.match(element(action==='register'?'#registerStatus':'#tokenStatus').textContent,/passwords do not match/);
});
test('human auth errors preserve generic recovery and hide unknown diagnostics',()=>{
  assert.match(humanError('invalid_credentials'),/email or password/);
  assert.match(humanError('account already exists'),/associated with a workspace/);
  assert.doesNotMatch(humanError('secret_internal_detail'),/secret_internal_detail/);
});
test('CSV classifications explain active, archived and intra-file duplicates without changing server status',()=>{
  const result=classifyImport([{status:'duplicate',value:{uei:'ABC'}},{status:'duplicate',value:{cage:'12345'}},{status:'duplicate',value:{normalizedName:'OTHER'}},{status:'invalid',error:'CAGE must be 5 alphanumeric characters'},{status:'valid',value:{legalName:'New'}}],[{uei:'ABC'},{cage:'12345',archivedAt:'date'}]);
  assert.deepEqual(result.slice(0,3).map(x=>x.issue),['Already in your watchlist','Already archived','Duplicate within this file']);
  assert.equal(result[3].status,'invalid');assert.match(result[3].issue,/exactly 5/);assert.equal(result[4].status,'valid');
});
test('malformed CSV diagnostics map to human guidance',()=>{
  assert.match(humanError('Unclosed CSV quote'),/unclosed quotation mark/);assert.doesNotMatch(humanError('Unclosed CSV quote'),/^Unclosed CSV quote$/);
});
test('capacity presentation uses actual entitlements and never authorizes extra slots',()=>{
  const billing={state:{plan:'trial'},entitlements:{active:true,vendorLimit:25}};
  assert.match(capacityCopy(billing).message,/Free Trial includes up to 25/);
  assert.equal(capacityCopy(billing,true).title,'Cannot restore vendor');
  assert.deepEqual(importCapacity(billing,2,24),{available:23,allowed:false});assert.equal(importCapacity(billing,2,23).allowed,true);
  assert.equal(importCapacity({entitlements:{active:false,vendorLimit:25}},0,1).allowed,false);
});
test('provider presentation keeps stale warnings even with recent source date',()=>{
  assert.match(sourceLabel({exclusionProvider:'sam-extract',exclusionSnapshot:{stale:true,sourceDate:new Date().toISOString()}}),/stale snapshot/);
  assert.doesNotMatch(sourceLabel({exclusionProvider:'sam-extract',exclusionSnapshot:{sourceDate:'2026-01-01',cache:'hit'}}),/sam-extract|hit/);
});
test('report keeps timestamps/source/evidence, no-match copy and unambiguous confidence',()=>{
  const screening={screenedAt:'2026-09-19T12:00:00Z',status:'clear',confidence:'high',source:{sourceDate:'2026-09-19',sourceFile:'sam.csv',sha256:'a'.repeat(64)},matches:[]};
  const html=screeningReport({legalName:'Sample'},[screening]);
  for(const value of [screening.screenedAt,'sam.csv','a'.repeat(64),'No matching exclusion records in the referenced snapshot.','not a legal eligibility determination'])assert.ok(html.includes(value));
  assert.doesNotMatch(html,/Source matches|Match confidence|<pre>\[\]<\/pre>/);
  assert.match(screeningReport({legalName:'Sample'},[{...screening,status:'excluded',matches:[{name:'<script>bad</script>',extra:{key:'preserved'}}]}]),/Match confidence/);
});
test('all confirmations use accessible shared dialog and capacity never redirects',async()=>{
  for(const file of ['vendors.js','vendor-tools.js','account.js']){const source=await read('public/'+file);assert.doesNotMatch(source,/(?<!Action)\bconfirm\(/);assert.match(source,/confirmAction/);}
  assert.doesNotMatch(await read('public/vendors.js'),/location.href='\/pricing/);
  const dialog=await read('public/components.js');for(const field of ['showModal','aria-labelledby','aria-describedby',"e.key==='Tab'","'cancel'"])assert.ok(dialog.includes(field));
});
