import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=await mkdtemp(join(tmpdir(),'exclusignal-billing-smoke-'));
const port=27000+(process.pid%7000);
const base=`http://127.0.0.1:${port}`;
const email=`billing-${process.pid}@example.com`;
const password='strong billing smoke password 123';
const secret=randomBytes(32).toString('base64url');
const cwd=fileURLToPath(new URL('..',import.meta.url));
const child=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,PORT:String(port),DATA_ROOT:root,STORAGE_DRIVER:'json',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EXCLUSION_PROVIDER:'mock',EMAIL_PROVIDER:'console',BILLING_PROVIDER:'mock',PUBLIC_BASE_URL:base,SESSION_SECRET:secret,COOKIE_SECURE:'false',AUTH_RATE_LIMIT:'100'},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',c=>{stderr+=c;});
async function req(path,{method='GET',payload,cookie}={}){const headers={};if(payload!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;const r=await fetch(base+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));return{response:r,data,cookie:(r.headers.get('set-cookie')||'').split(';')[0]||null};}
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/ready');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`server not ready: ${stderr.slice(-1200)}`);}
async function token(){for(let i=0;i<30;i++){try{for(const file of (await readdir(join(root,'outbox'))).filter(x=>x.endsWith('.json'))){const d=JSON.parse(await readFile(join(root,'outbox',file),'utf8'));if(d.template==='verify-email')return new URL(d.payload.link).searchParams.get('verify');}}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('verification token missing');}
function expect(actual,expected,label){if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);}
try{
  await ready();
  let x=await req('/api/auth/register',{method:'POST',payload:{email,password}});expect(x.response.status,201,'register');
  x=await req('/api/auth/verify-email',{method:'POST',payload:{token:await token()}});expect(x.response.status,200,'verify');const cookie=x.cookie;
  x=await req('/api/billing/status',{cookie});expect(x.response.status,200,'billing status');expect(x.data.state.plan,'trial','trial plan');expect(x.data.entitlements.active,true,'trial active');expect(x.data.entitlements.vendorLimit,25,'trial vendor limit');
  x=await req('/api/billing/checkout',{method:'POST',cookie,payload:{plan:'starter'}});expect(x.response.status,503,'mock checkout unavailable');expect(x.data.error,'billing_unavailable','checkout error');
  x=await req('/api/vendors',{method:'POST',cookie,payload:{legalName:'Billing Trial Vendor LLC',uei:'BILL12345678'}});expect(x.response.status,201,'trial vendor add');
  x=await req('/api/vendors/screen',{method:'POST',cookie,payload:{}});expect(x.response.status,200,'trial screen');
  console.log(JSON.stringify({ok:true,trial:'active',vendorLimit:25,checkoutWithoutStripe:503,trialScreening:200},null,2));
}finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{const t=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(t);resolve();});});
  await rm(root,{recursive:true,force:true});
}
