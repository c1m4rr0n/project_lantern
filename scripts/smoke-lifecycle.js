import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

function freePort() {
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const {port}=server.address();
      server.close(error=>error?reject(error):resolve(port));
    });
  });
}

function runProcess(env,{signalViaIpc=false}={}) {
  const args=signalViaIpc
    ? ['--input-type=module','--eval',"process.on('message',message=>{if(message==='SIGTERM')process.emit('SIGTERM');});await import('./server.js');"]
    : ['server.js'];
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...env},stdio:signalViaIpc?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  return {child,terminate:()=>signalViaIpc?child.send('SIGTERM'):child.kill('SIGTERM'),get stdout(){return stdout;},get stderr(){return stderr;}};
}

async function waitForReady(url, timeoutMs=8000) {
  const deadline=Date.now()+timeoutMs;
  let last;
  while(Date.now()<deadline){
    try {
      const res=await fetch(url);
      if(res.ok)return await res.json();
      last=new Error(`ready returned ${res.status}`);
    } catch(error){last=error;}
    await new Promise(r=>setTimeout(r,100));
  }
  throw last || new Error('readiness timeout');
}

async function exitResult(child, timeoutMs=8000) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('process exit timeout'));},timeoutMs);
    child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});
  });
}

const root=await mkdtemp(join(tmpdir(),'lantern-lifecycle-'));
try {
  const badPort=await freePort();
  const bad=runProcess({
    NODE_ENV:'production',PORT:String(badPort),DATA_ROOT:join(root,'bad'),STORAGE_DRIVER:'sqlite',
    PUBLIC_BASE_URL:'http://localhost',COOKIE_SECURE:'false',SESSION_SECRET:'short',
    DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',SCHEDULER_ENABLED:'false',EMAIL_PROVIDER:'console'
  });
  const badExit=await exitResult(bad.child);
  if(badExit.code===0 || !/production preflight failed/i.test(`${bad.stderr}\n${bad.stdout}`)) {
    throw new Error(`unsafe production process did not fail fast: ${JSON.stringify({badExit,stdout:bad.stdout,stderr:bad.stderr})}`);
  }

  const port=await freePort();
  const live=runProcess({
    NODE_ENV:'production',PORT:String(port),DATA_ROOT:join(root,'live'),STORAGE_DRIVER:'sqlite',
    PUBLIC_BASE_URL:'https://lantern.example.com',COOKIE_SECURE:'true',SESSION_SECRET:'x'.repeat(48),TRUST_PROXY:'true',
    DATA_PROVIDER:'sam',MARKET_PROVIDER:'usaspending',SAM_API_KEY:'smoke-only-placeholder',SAM_API_KEY_EXPIRES_AT:'2099-12-31',
    SCHEDULER_ENABLED:'true',SCHEDULER_INTERVAL_MS:'60000',EMAIL_PROVIDER:'resend',RESEND_API_KEY:'smoke-only-placeholder',EMAIL_FROM:'ExcluSignal <alerts@example.com>',
    BILLING_PROVIDER:'stripe',STRIPE_SECRET_KEY:'sk_test_smoke_placeholder',STRIPE_WEBHOOK_SECRET:'whsec_smoke_placeholder',STRIPE_PRICE_STARTER:'price_starter_smoke',STRIPE_PRICE_TEAM:'price_team_smoke'
  },{signalViaIpc:process.platform==='win32'});
  const ready=await waitForReady(`http://127.0.0.1:${port}/api/ready`);
  if(!ready.ok)throw new Error('valid production process was not ready');
  live.terminate();
  const liveExit=await exitResult(live.child);
  if(liveExit.code!==0 || !/shutdown_complete/.test(live.stdout)) {
    throw new Error(`graceful shutdown failed: ${JSON.stringify({liveExit,stdout:live.stdout,stderr:live.stderr})}`);
  }
  console.log(JSON.stringify({ok:true,unsafeConfigExit:badExit.code,ready:ready.ok,gracefulExit:liveExit.code}));
} finally {
  await rm(root,{recursive:true,force:true});
}
