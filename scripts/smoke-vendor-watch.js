import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=await mkdtemp(join(tmpdir(),'lantern-vendor-smoke-'));
const port=26000+(process.pid%8000);
const base=`http://127.0.0.1:${port}`;
const email=`vendor-${process.pid}@example.com`;
const password='strong vendor watch password 123';
const secret=randomBytes(32).toString('base64url');
const cwd=fileURLToPath(new URL('..',import.meta.url));
const child=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,PORT:String(port),DATA_ROOT:root,STORAGE_DRIVER:'json',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EXCLUSION_PROVIDER:'mock',EMAIL_PROVIDER:'console',PUBLIC_BASE_URL:base,SESSION_SECRET:secret,COOKIE_SECURE:'false',AUTH_RATE_LIMIT:'100'},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',c=>{stderr+=c;});
async function req(path,{method='GET',payload,cookie}={}){const headers={};if(payload!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;const r=await fetch(base+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));return{response:r,data,cookie:(r.headers.get('set-cookie')||'').split(';')[0]||null};}
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/ready');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`server not ready: ${stderr.slice(-1200)}`);}
async function token(){for(let i=0;i<30;i++){try{for(const file of (await readdir(join(root,'outbox'))).filter(x=>x.endsWith('.json'))){const d=JSON.parse(await readFile(join(root,'outbox',file),'utf8'));if(d.template==='verify-email')return new URL(d.payload.link).searchParams.get('verify');}}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('verification token missing');}
function expect(actual,expected,label){if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);}
try{
  await ready();
  let x=await req('/api/auth/register',{method:'POST',payload:{email,password}});expect(x.response.status,201,'register');
  x=await req('/api/auth/verify-email',{method:'POST',payload:{token:await token()}});expect(x.response.status,200,'verify');const cookie=x.cookie;
  x=await req('/api/vendors',{method:'POST',cookie,payload:{legalName:'Risk Vendor LLC',uei:'RISK12345678',cage:'9RISK',notes:'critical supplier'}});expect(x.response.status,201,'add vendor');const id=x.data.id;
  x=await req('/api/vendors/screen',{method:'POST',cookie,payload:{}});expect(x.response.status,200,'screen all');expect(x.data.excluded,1,'excluded count');expect(x.data.alerts,1,'alert count');
  x=await req('/api/vendors',{cookie});expect(x.response.status,200,'list vendors');expect(x.data[0].watch.latest.status,'excluded','vendor status');expect(x.data[0].watch.unreadCount,1,'unread alert');
  x=await req(`/api/vendors/${encodeURIComponent(id)}/screenings/ack`,{method:'POST',cookie});expect(x.response.status,200,'ack');expect(x.data.acknowledged,1,'ack count');
  x=await req('/api/digest',{cookie});expect(x.response.status,200,'digest');expect(x.data.vendorWatch.total,1,'digest vendor total');expect(x.data.vendorWatch.excludedCount,1,'digest excluded');
  console.log(JSON.stringify({ok:true,vendor:id,status:'excluded',match:'UEI+CAGE',digest:true,acknowledged:true},null,2));
}finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{const t=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(t);resolve();});});
  await rm(root,{recursive:true,force:true});
}
