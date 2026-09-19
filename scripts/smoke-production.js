import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=await mkdtemp(join(tmpdir(),'lantern-production-smoke-'));
let sequence=0;

function launch(overrides={}){
  const port=24000+((process.pid+sequence++)%8000);
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),
    env:{
      ...process.env,
      NODE_ENV:'production', PORT:String(port), DATA_ROOT:root, STORAGE_DRIVER:'sqlite', DATA_PROVIDER:'sam', MARKET_PROVIDER:'usaspending',
      SCHEDULER_ENABLED:'true', SCHEDULER_INTERVAL_MS:'5000', DAILY_JOB_HOUR_UTC:'23', BACKUP_HOUR_UTC:'23',
      EMAIL_DELIVERY_INTERVAL_MS:'5000', SESSION_SECRET:randomBytes(32).toString('base64url'), COOKIE_SECURE:'true', TRUST_PROXY:'true',
      PUBLIC_BASE_URL:'https://lantern.example.test', SAM_API_KEY:'smoke-placeholder-not-a-real-key', EMAIL_PROVIDER:'resend',
      RESEND_API_KEY:'re_smoke_placeholder', EMAIL_FROM:'ExcluSignal <alerts@example.test>', BILLING_PROVIDER:'stripe', STRIPE_SECRET_KEY:'sk_test_smoke_placeholder', STRIPE_WEBHOOK_SECRET:'whsec_smoke_placeholder', STRIPE_PRICE_STARTER:'price_starter_smoke', STRIPE_PRICE_TEAM:'price_team_smoke', ...overrides
    },
    stdio:['ignore','pipe','pipe']
  });
  let stdout='',stderr=''; child.stdout.on('data',c=>{stdout+=c;}); child.stderr.on('data',c=>{stderr+=c;});
  return {child,base,get stdout(){return stdout;},get stderr(){return stderr;}};
}
async function stop(proc){proc.child.kill('SIGTERM');await new Promise(resolve=>{const t=setTimeout(resolve,1200);proc.child.once('exit',()=>{clearTimeout(t);resolve();});});}
async function waitReadyResponse(proc){
  for(let i=0;i<60;i++){
    try { const r=await fetch(proc.base+'/api/ready'); const data=await r.json(); return {status:r.status,data}; }
    catch {}
    if(proc.child.exitCode!==null)throw new Error(`server exited ${proc.child.exitCode}: ${proc.stderr.slice(-1000)}`);
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error(`server did not answer readiness: ${proc.stderr.slice(-1000)}`);
}
function expect(v,label){if(!v)throw new Error(label);}

let good,bad;
try {
  good=launch();
  const ready=await waitReadyResponse(good);
  expect(ready.status===200,'intended production config must be ready');
  expect(Object.values(ready.data.checks).every(Boolean),'all intended production checks must pass');
  await stop(good); good=null;

  bad=launch({EMAIL_PROVIDER:'console',COOKIE_SECURE:'false',SCHEDULER_ENABLED:'false',BILLING_PROVIDER:'mock'});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('unsafe production process did not exit')),5000);
    bad.child.once('exit',(code)=>{clearTimeout(timer);expect(code!==0,'unsafe production config must exit non-zero');resolve();});
  });
  const badOutput=`${bad.stdout}\n${bad.stderr}`;
  expect(/production preflight failed/i.test(badOutput),'unsafe production exit must identify preflight failure');
  expect(/secureCookie/.test(badOutput),'insecure cookies must be rejected in production');
  expect(/scheduler/.test(badOutput),'disabled scheduler must be rejected in production launch mode');
  expect(/liveEmail/.test(badOutput),'console email must be rejected in production');
  expect(/liveBilling/.test(badOutput),'mock billing must be rejected in production');
  bad=null;

  console.log(JSON.stringify({ok:true,intendedProductionReady:200,unsafeProductionExit:'non-zero',rejectedChecks:['liveEmail','liveBilling','secureCookie','scheduler']},null,2));
} finally {
  if(good)await stop(good);
  if(bad)await stop(bad);
  await rm(root,{recursive:true,force:true});
}
