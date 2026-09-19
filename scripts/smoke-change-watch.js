import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TenantJsonStore } from '../src/storage/tenant-json-store.js';

const root=await mkdtemp(join(tmpdir(),'lantern-change-smoke-'));
const port=21000+(process.pid%10000);
const base=`http://127.0.0.1:${port}`;
const email=`change-${process.pid}@example.com`;
const password='strong change watch password 123';
const secret=randomBytes(32).toString('base64url');
const cwd=fileURLToPath(new URL('..',import.meta.url));
const child=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,PORT:String(port),DATA_ROOT:root,STORAGE_DRIVER:'json',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EMAIL_PROVIDER:'console',PUBLIC_BASE_URL:base,SESSION_SECRET:secret,COOKIE_SECURE:'false',AUTH_RATE_LIMIT:'100'},stdio:['ignore','pipe','pipe']});
let stderr=''; child.stderr.on('data',c=>{stderr+=c;});

async function req(path,{method='GET',payload,cookie}={}){const headers={};if(payload!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;const response=await fetch(base+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));return{response,data,cookie:(response.headers.get('set-cookie')||'').split(';')[0]||null};}
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/ready');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`server not ready: ${stderr.slice(-1000)}`);}
async function token(){for(let i=0;i<30;i++){try{for(const file of (await readdir(join(root,'outbox'))).filter(x=>x.endsWith('.json'))){const d=JSON.parse(await readFile(join(root,'outbox',file),'utf8'));if(d.template==='verify-email')return new URL(d.payload.link).searchParams.get('verify');}}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('verification token missing');}
function expect(actual,expected,label){if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);}

try{
  await ready();
  let x=await req('/api/auth/register',{method:'POST',payload:{email,password}});expect(x.response.status,201,'register');
  x=await req('/api/auth/verify-email',{method:'POST',payload:{token:await token()}});expect(x.response.status,200,'verify');const cookie=x.cookie;const tenantId=x.data.tenantId;
  x=await req('/api/profile',{method:'POST',cookie,payload:{name:'Change Watch Smoke',naics:['541512'],capabilities:['cloud support'],setAsides:[],regions:['PR'],negativeKeywords:[]}});expect(x.response.status,200,'profile');
  x=await req('/api/opportunities',{cookie});expect(x.response.status,200,'opportunities');const id=x.data[0]?.id;if(!id)throw new Error('mock opportunity missing');
  x=await req(`/api/opportunities/${encodeURIComponent(id)}/decision`,{method:'POST',cookie,payload:{status:'pursue',note:'track this'}});expect(x.response.status,200,'decision');
  const store=new TenantJsonStore({root:join(root,'tenants'),tenantId});
  await store.appendOpportunityChange(id,{id:'smoke-change-1',opportunityId:id,detectedAt:'2026-09-18T20:00:00Z',beforeFingerprint:'a',afterFingerprint:'b',changes:[{field:'deadline',before:'2026-10-01',after:'2026-10-08'}],acknowledgedAt:null});
  x=await req(`/api/opportunities/${encodeURIComponent(id)}`,{cookie});expect(x.response.status,200,'opportunity detail');expect(x.data.changeWatch.unreadCount,1,'unread change count');
  x=await req(`/api/opportunities/${encodeURIComponent(id)}/changes`,{cookie});expect(x.response.status,200,'change history');expect(x.data.changes.length,1,'change history length');
  x=await req(`/api/opportunities/${encodeURIComponent(id)}/changes/ack`,{method:'POST',cookie});expect(x.response.status,200,'ack');expect(x.data.acknowledged,1,'ack count');
  x=await req(`/api/opportunities/${encodeURIComponent(id)}`,{cookie});expect(x.data.changeWatch.unreadCount,0,'unread after ack');
  console.log(JSON.stringify({ok:true,trackedOpportunity:id,unreadBeforeAck:1,acknowledged:1,unreadAfterAck:0},null,2));
}finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{const t=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(t);resolve();});});
  await rm(root,{recursive:true,force:true});
}
