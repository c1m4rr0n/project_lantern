import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseIdentity } from '../src/runtime/release.js';
import { audit, safeErrorCode } from '../src/security/events.js';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { createSqliteBackup } from '../src/ops/sqlite-backup.js';
import { signedPut, syncOffsiteBackups, uploadVerifiedBackup } from '../src/ops/offsite-backup.js';
test('release identity matches package and exposes only validated commit',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
  assert.equal(releaseIdentity({}).version,pkg.version);
  assert.ok((await readFile(new URL('../CURRENT_STATE.md',import.meta.url),'utf8')).includes('Source version: '+pkg.version));
  assert.equal(releaseIdentity({GIT_COMMIT_SHA:'secret value'}).commit,null);
  assert.equal(releaseIdentity({RAILWAY_GIT_COMMIT_SHA:'a'.repeat(40)}).commit,'a'.repeat(40));
  assert.equal(safeErrorCode(new Error('secret https://user:pass@host')),'operation_failed');
});
for(const driver of ['sqlite','json'])test(`durable isolated audit ${driver}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-audit-'));let storage=createStorageManager({driver,dataRoot:root});
  try {
    const store=storage.tenantStore('tenant-12345678');
    await Promise.all(Array.from({length:10},()=>audit(store,'login.success')));
    assert.equal((await store.getAuditEvents()).length,10);
    assert.deepEqual(await storage.tenantStore('tenant-87654321').getAuditEvents(),[]);
    storage.close();storage=createStorageManager({driver,dataRoot:root});
    assert.equal((await storage.tenantStore('tenant-12345678').getAuditEvents()).length,10);
  } finally {storage.close();await rm(root,{recursive:true,force:true});}
});
test('offsite verifies bytes, uploads manifest last, retries durably, remains optional',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-offsite-'));
  const storage=createStorageManager({driver:'sqlite',dataRoot:root});storage.close();
  const env={OFFSITE_BACKUP_ENABLED:'true',OFFSITE_BACKUP_ENDPOINT:'https://storage.example.test',OFFSITE_BACKUP_BUCKET:'private',OFFSITE_BACKUP_REGION:'auto',OFFSITE_BACKUP_ACCESS_KEY_ID:'fake-id',OFFSITE_BACKUP_SECRET_ACCESS_KEY:'fake-secret'};
  try {
    const manifest=await createSqliteBackup({sourcePath:join(root,'lantern.sqlite'),backupDir:join(root,'backups')});
    assert.deepEqual(await syncOffsiteBackups({dataRoot:root,env:{}}),{enabled:false});
    const now=new Date();let calls=[];
    const failed=await syncOffsiteBackups({dataRoot:root,env,now,fetchFn:async()=>({ok:false})});
    assert.equal(failed.pending,1);assert.equal(failed.lastError,'operation_failed');
    const success=await syncOffsiteBackups({dataRoot:root,env,now:new Date(now.getTime()+3600000),fetchFn:async(url,options)=>{calls.push(url);assert.match(options.headers.authorization,/AWS4-HMAC-SHA256/);return{ok:true};}});
    assert.equal(success.pending,0);assert.equal(calls.length,2);assert.ok(calls[1].endsWith('.json'));
    await assert.rejects(()=>uploadVerifiedBackup({directory:join(root,'backups'),manifest:{...manifest,sha256:'bad'},env}),/checksum/);
    assert.throws(()=>signedPut({env:{...env,OFFSITE_BACKUP_ENDPOINT:'http://unsafe'},key:'file',bytes:Buffer.from('')}),/endpoint/);
  } finally {await rm(root,{recursive:true,force:true});}
});
