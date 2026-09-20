import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { humanError, sourceLabel } from '../public/polish-model.js';

const source=(await readFile(new URL('../public/vendors.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/load\(\)\.catch\(e=>\{\$\('#vendorList'\)[\s\S]*$/,'');
function setup({failSave=false,failRefresh=false,atCapacity=false}={}){
  const elements=new Map();
  const element=key=>{if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){}});return elements.get(key);};
  const button={disabled:false};let resets=0,posts=0,capacityTarget=null;
  const form={querySelector:()=>button,reset(){resets++;},setAttribute(){},removeAttribute(){}};
  const context=vm.createContext({humanError,sourceLabel,capacityFeedback:target=>{capacityTarget=target;},initVendorTools:()=>({update(){}}),document:{querySelector:element,querySelectorAll:()=>[]},location:{search:''},URLSearchParams,FormData:class{get(key){return key==='legalName'?'Test Vendor':'';}},setAccountIdentity(){},bindLogout(){},fetch:async(path,options)=>{
    if(options?.method==='POST'){posts++;await Promise.resolve();if(failSave)throw new Error('Offline');if(atCapacity)return {ok:false,status:402,text:async()=>JSON.stringify({error:'vendor_limit_reached'})};return {ok:true,status:201,json:async()=>({})};}
    if(failRefresh)throw new Error('Offline');
    return {ok:true,status:200,json:async()=>path==='/api/vendors'?[]:{}};
  }});
  vm.runInContext(source,context);
  return {submit:element('#vendorForm').onsubmit,form,button,element,get resets(){return resets;},get posts(){return posts;},get capacityTarget(){return capacityTarget;},location:context.location};
}
test('vendor submit survives event currentTarget clearing and prevents repeat submissions',async()=>{
  const app=setup();const event={preventDefault(){},currentTarget:app.form};
  const pending=app.submit(event);event.currentTarget=null;
  await app.submit({preventDefault(){},currentTarget:app.form});await pending;
  assert.equal(app.posts,1);assert.equal(app.resets,1);assert.equal(app.button.disabled,false);
  assert.match(app.element('#formStatus').textContent,/Vendor added/);
});
test('failed vendor save retains form data and restores the submit button',async()=>{
  const app=setup({failSave:true});await app.submit({preventDefault(){},currentTarget:app.form});
  assert.equal(app.resets,0);assert.equal(app.button.disabled,false);assert.match(app.element('#formStatus').textContent,/Offline/);
});
test('refresh failure after successful save does not report the save as failed',async()=>{
  const app=setup({failRefresh:true});await app.submit({preventDefault(){},currentTarget:app.form});
  assert.equal(app.resets,1);assert.match(app.element('#formStatus').textContent,/Vendor added/);
  assert.match(app.element('#screenAllStatus').textContent,/change was saved/);
});

test('402 add feedback stays in the form without a redirect or lost input',async()=>{
  const app=setup({atCapacity:true});await app.submit({preventDefault(){},currentTarget:app.form});
  assert.equal(app.capacityTarget,app.element('#formStatus'));assert.equal(app.location.href,undefined);assert.equal(app.resets,0);assert.equal(app.button.disabled,false);
});

test('archive and review refresh watchlist, counters, capacity and archive state without reload',async()=>{
  const elements=new Map();const element=key=>{if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',classList:{toggle(){},remove(){}},setAttribute(){}});return elements.get(key);};
  const vendor={id:'local-vendor',legalName:'Test vendor',watch:{unreadCount:1,latest:{status:'possible-match',screenedAt:'2026-09-19T00:00:00Z'}}};
  let active=[vendor],archived=[],updates=0,allowArchive=false;
  const context=vm.createContext({humanError,sourceLabel,confirmAction:async()=>allowArchive,initVendorTools:()=>({update(){updates++;}}),document:{querySelector:element,querySelectorAll:()=>[]},location:{search:''},URLSearchParams,setAccountIdentity(){},bindLogout(){},fetch:async(path,options)=>{
    if(options?.method==='DELETE'){active=[];archived=[{...vendor,archivedAt:'2026-09-19T12:00:00Z'}];}
    if(options?.method==='POST')vendor.watch.unreadCount=0;
    const data=path==='/api/vendors'?active:path==='/api/vendors?archived=true'?archived:path==='/api/billing/status'?{state:{plan:'trial'},entitlements:{active:true,vendorLimit:25}}:{};
    return {ok:true,status:200,json:async()=>data};
  }});
  vm.runInContext(source,context);await vm.runInContext('load()',context);
  assert.equal(element('#alertCount').textContent,1);
  await vm.runInContext("ack('local-vendor')",context);assert.equal(element('#alertCount').textContent,0);
  await vm.runInContext("removeVendor('local-vendor')",context);assert.equal(active.length,1,'cancel must not archive');
  allowArchive=true;await vm.runInContext("removeVendor('local-vendor')",context);
  assert.equal(element('#vendorCount').textContent,0);assert.match(element('#vendorList').innerHTML,/watchlist starts here/);
  assert.match(element('#billingBanner').innerHTML,/<strong>0/);assert.equal(vm.runInContext('archived.length',context),1);assert.equal(updates,3);
});
