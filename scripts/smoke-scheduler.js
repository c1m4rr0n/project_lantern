import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStorageManager } from '../src/storage/storage-manager.js';

const root=await mkdtemp(join(tmpdir(),'lantern-scheduler-smoke-'));
const port=20000+(process.pid%10000);
const base=`http://127.0.0.1:${port}`;
const secret=randomBytes(32).toString('base64url');
const email=`scheduler-${process.pid}@example.com`;

async function seedAccount(){
  const storage=createStorageManager({driver:'sqlite',dataRoot:root});
  try {
    const user=await storage.accountStore.register({email,password:'scheduler smoke password 123'});
    const issued=await storage.accountStore.issueEmailVerification({email});
    const verified=await storage.accountStore.verifyEmailToken(issued.token);
    if(!verified?.emailVerifiedAt) throw new Error('failed to verify seeded account');
    const store=storage.tenantStore(user.tenantId);
    await store.saveProfile({
      name:'Scheduler Smoke Co',
      naics:['541511'],
      capabilities:['software','cloud','application development'],
      setAsides:[],
      regions:['United States'],
      negativeKeywords:[]
    });
  } finally { storage.close(); }
}

function launch(){
  const child=spawn(process.execPath,['server.js'],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),
    env:{
      ...process.env,
      PORT:String(port), DATA_ROOT:root, STORAGE_DRIVER:'sqlite', DATA_PROVIDER:'mock', MARKET_PROVIDER:'mock',
      EMAIL_PROVIDER:'console', PUBLIC_BASE_URL:base, SESSION_SECRET:secret, COOKIE_SECURE:'false', AUTH_RATE_LIMIT:'100',
      SCHEDULER_ENABLED:'true', SCHEDULER_INTERVAL_MS:'5000', DAILY_JOB_HOUR_UTC:'0', BACKUP_HOUR_UTC:'0',
      EMAIL_DELIVERY_INTERVAL_MS:'5000', SCHEDULER_RETRY_MS:'5000', BACKUP_RETENTION_COUNT:'3'
    },
    stdio:['ignore','pipe','pipe']
  });
  let stdout='',stderr='';
  child.stdout.on('data',c=>{stdout+=c;}); child.stderr.on('data',c=>{stderr+=c;});
  return {child,get stdout(){return stdout;},get stderr(){return stderr;}};
}

async function stop(proc){
  proc.child.kill('SIGTERM');
  await new Promise(resolve=>{const t=setTimeout(resolve,1500);proc.child.once('exit',()=>{clearTimeout(t);resolve();});});
}
async function health(){const r=await fetch(base+'/api/health');return {status:r.status,data:await r.json()};}
async function waitFor(predicate,proc,label){
  for(let i=0;i<80;i++){
    try { const h=await health(); if(predicate(h)) return h; } catch {}
    if(proc.child.exitCode!==null) throw new Error(`${label}: server exited ${proc.child.exitCode}: ${proc.stderr.slice(-1000)}`);
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error(`${label}: timed out: ${proc.stderr.slice(-1000)} ${proc.stdout.slice(-1000)}`);
}
function expect(value,label){if(!value)throw new Error(label);}

let first,second;
try {
  await seedAccount();
  first=launch();
  const h1=await waitFor(h=>h.status===200 && h.data?.operations?.scheduler?.daily?.completedDate && h.data?.operations?.scheduler?.backup?.completedDate && h.data?.operations?.outbox?.sent>=1,first,'first scheduler cycle');
  expect(h1.data.schedulerEnabled===true,'scheduler should be enabled');
  expect(h1.data.operations.scheduler.daily.lastError===null,'daily scheduler should succeed');
  expect(h1.data.operations.scheduler.backup.integrity==='ok','backup integrity should be ok');
  expect(h1.data.operations.latestBackup?.integrity==='ok','latest backup should be healthy');
  const firstDailySuccess=h1.data.operations.scheduler.daily.lastSuccessAt;
  const firstBackupSuccess=h1.data.operations.scheduler.backup.lastSuccessAt;
  const firstSent=h1.data.operations.outbox.sent;
  const firstBackups=(await readdir(join(root,'backups'))).filter(x=>x.endsWith('.sqlite')).length;
  await stop(first); first=null;

  second=launch();
  const h2=await waitFor(h=>h.status===200 && h.data?.operations?.scheduler?.lastTickAt,second,'restart scheduler cycle');
  await new Promise(r=>setTimeout(r,700));
  const after=await health();
  const secondBackups=(await readdir(join(root,'backups'))).filter(x=>x.endsWith('.sqlite')).length;
  expect(after.data.operations.scheduler.daily.lastSuccessAt===firstDailySuccess,'daily job duplicated after restart');
  expect(after.data.operations.scheduler.backup.lastSuccessAt===firstBackupSuccess,'backup duplicated after restart');
  expect(after.data.operations.outbox.sent===firstSent,'email delivery duplicated after restart');
  expect(secondBackups===firstBackups,'backup file count changed after restart');

  console.log(JSON.stringify({
    ok:true,
    schedulerEnabled:true,
    dailyCompletedDate:after.data.operations.scheduler.daily.completedDate,
    emailSent:after.data.operations.outbox.sent,
    backupIntegrity:after.data.operations.latestBackup.integrity,
    restartIdempotent:true,
    backupFiles:secondBackups
  },null,2));
} finally {
  if(first) await stop(first);
  if(second) await stop(second);
  await rm(root,{recursive:true,force:true});
}
