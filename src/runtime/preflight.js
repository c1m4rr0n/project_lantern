import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { buildReadinessChecks } from './readiness.js';

function normalizePath(value) {
  try { return resolve(String(value || '')); }
  catch { return ''; }
}

export async function probeWritableDirectory(path) {
  const root=normalizePath(path);
  if (!root) return false;
  await mkdir(root,{recursive:true});
  await access(root,constants.R_OK | constants.W_OK);
  const probe=`${root}/.lantern-write-probe-${process.pid}-${Date.now()}`;
  try {
    await writeFile(probe,'ok',{mode:0o600,flag:'wx'});
    return true;
  } finally {
    await rm(probe,{force:true});
  }
}

export async function runStartupPreflight({
  env=process.env,
  production=env.NODE_ENV==='production',
  dataRoot,
  providerName='mock',
  marketProviderName='mock',
  storageDriver='sqlite',
  schedulerEnabled=false,
  storage=null
} = {}) {
  const checks=buildReadinessChecks({production,env,providerName,marketProviderName,storageDriver,schedulerEnabled});
  checks.dataRootWritable=await probeWritableDirectory(dataRoot).catch(()=>false);

  if (production && env.RAILWAY_PROJECT_ID) {
    const mount=normalizePath(env.RAILWAY_VOLUME_MOUNT_PATH);
    checks.railwayVolumeAttached=Boolean(mount);
    checks.railwayVolumeMatchesDataRoot=Boolean(mount) && mount===normalizePath(dataRoot);
  }

  if (storage?.integrityCheck) {
    try { checks.storageIntegrity=(await storage.integrityCheck())==='ok'; }
    catch { checks.storageIntegrity=false; }
  }

  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  const result={ok:failed.length===0,checks,failed};
  if (production && !result.ok) {
    const error=new Error(`production preflight failed: ${failed.join(', ')}`);
    error.code='PRODUCTION_PREFLIGHT_FAILED';
    error.preflight=result;
    throw error;
  }
  return result;
}
