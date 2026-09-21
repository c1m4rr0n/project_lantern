import { spawn } from 'node:child_process';
import { mkdtemp,readdir,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'lantern-commercial-smoke-'));
const port=21000+process.pid%10000,base=`http://127.0.0.1:${port}`,password='commercial test password 123';
const child=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,NODE_ENV:'development',PORT:String(port),DATA_ROOT:root,STORAGE_DRIVER:'sqlite',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EXCLUSION_PROVIDER:'mock',EMAIL_PROVIDER:'console',BILLING_PROVIDER:'mock',PUBLIC_BASE_URL:base,SESSION_SECRET:randomBytes(32).toString('hex'),SCHEDULER_ENABLED:'false',COOKIE_SECURE:'false',PUBLIC_LAUNCH_ENABLED:'false',AUTH_RATE_LIMIT:'200'},stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stderr.on('data',c=>{diagnostics+=c;});child.stdout.on('data',()=>{});
async function req(path,{method='GET',payload,cookie,origin=base}={}){const response=await fetch(base+path,{method,headers:{...(payload?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),origin},body:payload?JSON.stringify(payload):undefined});const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,cookie:(response.headers.get('set-cookie')||'').split(';')[0]};}
async function account(email){let r=await req('/api/auth/register',{method:'POST',payload:{email,password}});assert.equal(r.status,201);const files=await readdir(join(root,'outbox'));for(const file of files){const item=JSON.parse(await readFile(join(root,'outbox',file),'utf8'));if(item.to===email){r=await req('/api/auth/verify-email',{method:'POST',payload:{token:new URL(item.payload.link).searchParams.get('verify')}});assert.equal(r.status,200);return r.cookie;}}throw new Error('Verification mail not found');}
try{
  let ready=false;for(let i=0;i<80;i++){try{if((await req('/api/ready')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,diagnostics);
  const a=await account('commercial-a@example.test'),b=await account('commercial-b@example.test');
  assert.equal((await req('/api/discovery')).status,401);
  assert.equal((await req('/api/sync',{method:'POST',cookie:a})).status,409);
  assert.equal((await req('/api/profile',{method:'POST',cookie:a,payload:{name:'Discovery QA',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:[],negativeKeywords:[],hardBlockers:[]}})).status,200);
  const discovery=await req('/api/sync',{method:'POST',cookie:a});assert.equal(discovery.status,200);assert.ok(discovery.data.discovery.evaluated>0);
  const reused=await req('/api/sync',{method:'POST',cookie:a,payload:{force:true}});assert.equal(reused.status,200);assert.equal(reused.data.reused,true);assert.deepEqual(reused.data.discovery,discovery.data.discovery);
  assert.equal((await req('/api/discovery',{cookie:b})).data.summary,null);
  assert.equal((await req('/api/discovery',{cookie:b})).data.configured,false);
  assert.equal((await req('/api/discovery',{cookie:a})).data.summary.evaluated,discovery.data.discovery.evaluated);
  const text='legal name,uei,cage\nACME,ABCDEF123456,12345\nName only,,\nRepeated,ABCDEF123456,';
  let r=await req('/api/vendors/import/preview',{method:'POST',payload:{text},cookie:a});assert.equal(r.data.valid,2);assert.equal(r.data.duplicates,1);
  r=await req('/api/vendors/import/commit',{method:'POST',payload:{text,fingerprint:r.data.fingerprint,rows:[2,3],confirmed:true},cookie:a});assert.equal(r.status,201);const id=r.data.items[0].id;
  assert.equal((await req(`/api/vendors/${id}`,{cookie:b})).status,404);
  assert.equal((await req(`/api/vendors/${id}/report`,{cookie:b})).status,404);
  const oversized='name\n'+Array.from({length:24},(_,i)=>'Capacity vendor '+i).join('\n');
  const capacityPreview=await req('/api/vendors/import/preview',{method:'POST',payload:{text:oversized},cookie:a});
  const over=await req('/api/vendors/import/commit',{method:'POST',payload:{text:oversized,fingerprint:capacityPreview.data.fingerprint,rows:capacityPreview.data.rows.map(x=>x.row),confirmed:true},cookie:a});assert.equal(over.status,402);assert.equal((await req('/api/vendors',{cookie:a})).data.length,2);
  assert.equal((await req('/api/vendors/screen',{method:'POST',payload:{},cookie:a})).status,200);
  r=await req(`/api/vendors/${id}/report`,{cookie:a});assert.equal(r.status,200);assert.match(r.data,/ExcluSignal/);
  assert.equal((await req(`/api/vendors/${id}`,{method:'DELETE',cookie:a})).status,200);
  assert.equal((await req('/api/vendors?archived=true',{cookie:a})).data.length,1);
  assert.equal((await req(`/api/vendors/${id}/screen`,{method:'POST',payload:{},cookie:a})).status,409);
  assert.equal((await req(`/api/vendors/${id}/screenings`,{cookie:a})).data.screenings.length,1);
  assert.equal((await req(`/api/vendors/${id}/restore`,{method:'POST',cookie:a})).status,200);
  assert.equal((await req('/api/account/export',{method:'POST',payload:{password},cookie:a,origin:'https://evil.example'})).status,403);
  assert.equal((await req('/api/account/export',{method:'POST',payload:{password:'wrong'},cookie:a})).status,401);
  r=await req('/api/account/export',{method:'POST',payload:{password},cookie:a});assert.equal(r.status,200);assert.equal(r.data.vendors.length,2);assert.ok(!JSON.stringify(r.data).includes('passwordHash'));
  assert.equal((await req('/api/account/delete',{method:'POST',payload:{password,confirmation:'no'},cookie:a})).status,400);
  assert.equal((await req('/api/account/delete',{method:'POST',payload:{password,confirmation:'DELETE'},cookie:a})).status,200);
  assert.equal((await req('/api/auth/me',{cookie:a})).status,401);assert.equal((await req('/api/auth/me',{cookie:b})).status,200);
  assert.match((await req('/robots.txt')).data,/Disallow: \//);assert.equal((await req('/sitemap.xml')).status,404);
  console.log(JSON.stringify({ok:true,import:true,archiveHistory:true,tenantIsolation:true,exportReauthentication:true,deletion:true,privateBeta:true}));
}finally{child.kill('SIGTERM');await new Promise(resolve=>{const t=setTimeout(resolve,2000);child.once('exit',()=>{clearTimeout(t);resolve();});});await rm(root,{recursive:true,force:true});}
