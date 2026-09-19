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
  return {
    dailyJob:daily ? {ok:daily.ok !== false,finishedAt:daily.finishedAt || null,queued:daily.queued ?? null,provider:daily.provider || null} : null,
    scheduler:scheduler ? {lastTickAt:scheduler.lastTickAt || null,daily:scheduler.daily || null,email:scheduler.email || null,backup:scheduler.backup || null} : null,
    outbox:{pending,sent,failed},
    latestBackup:latestBackup ? {createdAt:latestBackup.createdAt || null,bytes:latestBackup.bytes || null,integrity:latestBackup.integrity || null} : null
  };
}
