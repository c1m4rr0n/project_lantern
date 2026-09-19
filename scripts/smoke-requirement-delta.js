import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TenantJsonStore } from '../src/storage/tenant-json-store.js';

const root=await mkdtemp(join(tmpdir(),'lantern-reqdelta-smoke-'));
const port=24000+(process.pid%10000);
const base=`http://127.0.0.1:${port}`;
const email=`reqdelta-${process.pid}@example.com`;
const password='strong requirement delta password 123';
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
  x=await req('/api/profile',{method:'POST',cookie,payload:{name:'Requirement Delta Smoke',naics:['541512'],capabilities:['cloud support'],setAsides:[],regions:['PR'],negativeKeywords:[],hardBlockers:['secret facility clearance']}});expect(x.response.status,200,'profile');
  expect(x.data.hardBlockers[0],'secret facility clearance','hard blocker profile');
  x=await req('/api/opportunities',{cookie});expect(x.response.status,200,'opportunities');const id=x.data[0]?.id;if(!id)throw new Error('mock opportunity missing');
  x=await req(`/api/opportunities/${encodeURIComponent(id)}/decision`,{method:'POST',cookie,payload:{status:'pursue',note:'active pursuit'}});expect(x.response.status,200,'decision');

  const store=new TenantJsonStore({root:join(root,'tenants'),tenantId});
  const event={
    id:'smoke-reqdelta-1',opportunityId:id,detectedAt:'2026-09-18T21:00:00Z',beforeFingerprint:'req-a',afterFingerprint:'req-b',changes:[],acknowledgedAt:null,
    impact:{scoreBefore:86,scoreAfter:0,scoreDelta:-86,recommendationBefore:'review-now',recommendationAfter:'skip',blockedBefore:false,blockedAfter:true,newRisks:['Hard blocker detected: secret facility clearance'],resolvedRisks:[]},
    requirementDelta:{changed:true,beforeFingerprint:'req-a',afterFingerprint:'req-b',summary:{added:1,removed:0,modified:1,blockers:1,actions:1},added:[{requirement:{text:'Offeror must hold a Secret facility clearance.',mandatory:true,source:'SAM.gov description · smoke',status:'unverified'},severity:'blocker',blockerHits:['secret facility clearance'],reason:'Hard-blocker term matched: secret facility clearance'}],removed:[],modified:[{before:{text:'Offeror must provide three references.',mandatory:true,source:'SAM.gov description · smoke',status:'unverified'},after:{text:'Offeror must provide five references.',mandatory:true,source:'SAM.gov description · smoke',status:'unverified'},severity:'action',blockerHits:[],reason:'Mandatory requirement changed and should be re-reviewed.',similarity:.8}],unchangedCount:0}
  };
  await store.appendOpportunityChange(id,event);

  x=await req(`/api/opportunities/${encodeURIComponent(id)}`,{cookie});expect(x.response.status,200,'opportunity detail');
  expect(x.data.changeWatch.latest.requirementDelta.summary.blockers,1,'blocker count');
  expect(x.data.changeWatch.latest.impact.scoreAfter,0,'fit impact');
  x=await req('/api/digest',{cookie});expect(x.response.status,200,'digest');
  expect(x.data.changedPursuits[0].requirementDelta.summary.blockers,1,'digest blocker count');
  console.log(JSON.stringify({ok:true,trackedOpportunity:id,requirementDelta:{added:1,modified:1,blockers:1},fitImpact:'86 -> 0',digestSurfaced:true},null,2));
}finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{const t=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(t);resolve();});});
  await rm(root,{recursive:true,force:true});
}
