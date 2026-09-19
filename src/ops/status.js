import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function readJson(path) {
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; return {error:'unreadable'}; }
}
async function countJson(dir) {
  try { return (await readdir(dir)).filter(x=>x.endsWith('.json')).length; }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}

export async function operationalStatus({ dataRoot }) {
  const [daily,scheduler,pending,sent,failed,backups]=await Promise.all([
    readJson(join(dataRoot,'ops','last-daily-run.json')),
    readJson(join(dataRoot,'ops','scheduler-state.json')),
    countJson(join(dataRoot,'outbox')),
    countJson(join(dataRoot,'outbox','sent')),
    countJson(join(dataRoot,'outbox','failed')),
    (async()=>{
      try { return (await readdir(join(dataRoot,'backups'))).filter(x=>x.endsWith('.sqlite.json')).sort().reverse(); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    })()
  ]);
  const latestBackup=backups[0] ? await readJson(join(dataRoot,'backups',backups[0])) : null;
  const offsite=await readJson(join(dataRoot,'ops','offsite-backup.json'));
  const safeTask=task=>task ? {lastAttemptAt:task.lastAttemptAt||null,lastSuccessAt:task.lastSuccessAt||null,completedDate:task.completedDate||null,lastError:task.lastError?'operation_failed':null,lastFailureAt:task.lastFailureAt||null,lastFailureCode:task.lastFailureCode?'operation_failed':null,integrity:task.integrity==='ok'?'ok':null,queued:task.queued??null,skipped:task.skipped??null} : null;
  return {
    offsite:process.env.OFFSITE_BACKUP_ENABLED==='true' ? {enabled:true,lastAttemptAt:offsite?.lastAttemptAt||null,lastSuccessAt:offsite?.lastSuccessAt||null,lastError:offsite?.error?'status_unreadable':offsite?.lastError||null,pending:offsite?.pending||0,expiredUnsent:offsite?.expiredUnsent||0} : {enabled:false},
    dailyJob:daily ? {ok:daily.ok !== false,finishedAt:daily.finishedAt || null,queued:daily.queued ?? null,provider:daily.provider || null} : null,
    scheduler:scheduler ? {lastTickAt:scheduler.lastTickAt || null,daily:safeTask(scheduler.daily),email:safeTask(scheduler.email),backup:safeTask(scheduler.backup)} : null,
    outbox:{pending,sent,failed},
    latestBackup:latestBackup ? {createdAt:latestBackup.createdAt || null,bytes:latestBackup.bytes || null,integrity:latestBackup.integrity || null} : null
  };
}
