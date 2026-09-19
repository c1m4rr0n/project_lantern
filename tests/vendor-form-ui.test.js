import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=(await readFile(new URL('../public/vendors.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/,'').replace(/load\(\)\.catch\(e=>\{\$\('#vendorList'\)[\s\S]*$/,'');
function setup({failSave=false,failRefresh=false}={}){
  const elements=new Map();
  const element=key=>{if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){}});return elements.get(key);};
  const button={disabled:false};let resets=0,posts=0;
  const form={querySelector:()=>button,reset(){resets++;},setAttribute(){},removeAttribute(){}};
  const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[]},location:{search:''},URLSearchParams,FormData:class{get(key){return key==='legalName'?'Test Vendor':'';}},setAccountIdentity(){},bindLogout(){},fetch:async(path,options)=>{
    if(options?.method==='POST'){posts++;await Promise.resolve();if(failSave)throw new Error('Offline');return {ok:true,status:201,json:async()=>({})};}
    if(failRefresh)throw new Error('Offline');
    return {ok:true,status:200,json:async()=>path==='/api/vendors'?[]:{}};
  }});
  vm.runInContext(source,context);
  return {submit:element('#vendorForm').onsubmit,form,button,element,get resets(){return resets;},get posts(){return posts;}};
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
