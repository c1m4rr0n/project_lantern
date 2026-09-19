import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runDaily } from './daily-run.js';
import { deliverOutbox } from '../notifications/outbox.js';
import { createSqliteBackup } from './sqlite-backup.js';
import { syncOffsiteBackups } from './offsite-backup.js';
import { safeErrorCode } from '../security/events.js';
import { withActivity } from '../security/activity.js';

async function readJson(path, fallback={}) {
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
}
async function atomicJson(path, value) {
  await mkdir(dirname(path),{recursive:true});
  const tmp=`${path}.${process.pid}.tmp`;
  await writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});
  await rename(tmp,path);
}
function isoDay(now){return now.toISOString().slice(0,10);}
function dueInterval(lastAttemptAt, now, intervalMs){return !lastAttemptAt || now-new Date(lastAttemptAt)>=intervalMs;}
function dueDaily(task, now, hourUtc, retryMs){
  const today=isoDay(now);
  if (task?.completedDate===today || now.getUTCHours()<hourUtc) return false;
  return dueInterval(task?.lastAttemptAt,now,retryMs);
}
function errorText(error){return safeErrorCode(error);}

export async function runOperationalTick({
  accountStore,
  tenantStoreFor,
  provider,
  watchProvider=null,
  detailProvider=null,
  exclusionProvider=null,
  billingStatusFor=null,
  providerName='unknown',
  seedOpportunities=[],
  outboxRoot,
  dataRoot,
  emailSender,
  storageDriver='sqlite',
  now=new Date(),
  dailyHourUtc=12,
  backupHourUtc=13,
  emailEveryMs=5*60_000,
  emailBatchLimit=100,
  retryMs=10*60_000,
  retentionCount=7,
  runDailyFn=runDaily,
  deliverOutboxFn=deliverOutbox,
  backupFn=createSqliteBackup
}) {
  const statePath=join(dataRoot,'ops','scheduler-state.json');
  const dailyStatusPath=join(dataRoot,'ops','last-daily-run.json');
  const state=await readJson(statePath,{version:1,daily:{},email:{},backup:{}});
  state.version=1; state.daily ||= {}; state.email ||= {}; state.backup ||= {};
  const actions=[];

  if (dueDaily(state.daily,now,Number(dailyHourUtc),Number(retryMs))) {
    state.daily.lastAttemptAt=now.toISOString();
    try {
      const result=await runDailyFn({accountStore,tenantStoreFor,provider,watchProvider,detailProvider,exclusionProvider,billingStatusFor,providerName,seedOpportunities,outboxRoot,productName:process.env.PRODUCT_NAME || 'ExcluSignal',now});
      state.daily={...state.daily,completedDate:isoDay(now),lastSuccessAt:now.toISOString(),lastError:null,queued:result.queued,skipped:result.skipped};
      await atomicJson(dailyStatusPath,{...result,provider:providerName,storage:storageDriver});
      actions.push({task:'daily',status:'ok',queued:result.queued,skipped:result.skipped});
    } catch (error) {
      state.daily.lastError=errorText(error);
      state.daily.lastFailureAt=now.toISOString();state.daily.lastFailureCode=state.daily.lastError;
      actions.push({task:'daily',status:'failed',error:state.daily.lastError});
    }
  }

  if (dueInterval(state.email.lastAttemptAt,now,Number(emailEveryMs))) {
    state.email.lastAttemptAt=now.toISOString();
    try {
      const result=await deliverOutboxFn({outboxRoot,sender:emailSender,limit:Math.max(1,Number(emailBatchLimit)||100),now});
      if (result.ok) { state.email.lastSuccessAt=now.toISOString(); state.email.lastError=null; }
      else {state.email.lastError=`${result.failed} delivery failure(s)`;state.email.lastFailureAt=now.toISOString();state.email.lastFailureCode='delivery_failed';}
      actions.push({task:'email',status:result.ok?'ok':'partial',processed:result.processed,sent:result.sent,failed:result.failed});
    } catch (error) {
      state.email.lastError=errorText(error);
      state.email.lastFailureAt=now.toISOString();state.email.lastFailureCode=state.email.lastError;
      actions.push({task:'email',status:'failed',error:state.email.lastError});
    }
  }

  if (storageDriver==='sqlite' && dueDaily(state.backup,now,Number(backupHourUtc),Number(retryMs))) {
    state.backup.lastAttemptAt=now.toISOString();
    try {
      const manifest=await backupFn({sourcePath:join(dataRoot,'lantern.sqlite'),backupDir:join(dataRoot,'backups'),now,retentionCount:Number(retentionCount)});
      state.backup={...state.backup,completedDate:isoDay(now),lastSuccessAt:now.toISOString(),lastError:null,file:manifest.file,integrity:manifest.integrity};
      actions.push({task:'backup',status:'ok',file:manifest.file,integrity:manifest.integrity});
    } catch (error) {
      state.backup.lastError=errorText(error);
      state.backup.lastFailureAt=now.toISOString();state.backup.lastFailureCode=state.backup.lastError;
      actions.push({task:'backup',status:'failed',error:state.backup.lastError});
    }
  }

  state.lastTickAt=now.toISOString();
  await syncOffsiteBackups({dataRoot,now});
  await atomicJson(statePath,state);
  return {ok:actions.every(x=>x.status==='ok'),actions,state};
}

export function startOperationalScheduler({ intervalMs=60_000, logger=console, ...options }) {
  let running=false,stopped=false;
  const tick=async()=>{
    if(stopped||running)return {skipped:true};
    running=true;
    try {
      const result=await withActivity(()=>runOperationalTick({...options,now:new Date()}));
      if(result.actions.length) logger.log(JSON.stringify({event:'scheduler_tick',actions:result.actions}));
      return result;
    } catch(error) {
      logger.error(JSON.stringify({event:'scheduler_error',error:errorText(error)}));
      return {ok:false,error:errorText(error)};
    } finally { running=false; }
  };
  const timer=setInterval(()=>{void tick();},Math.max(5_000,Number(intervalMs)||60_000));
  timer.unref?.();
  void tick();
  return {tick,stop(){stopped=true;clearInterval(timer);}};
}
