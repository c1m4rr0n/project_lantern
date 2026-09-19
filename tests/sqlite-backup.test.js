import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageManager } from '../src/storage/sqlite-storage.js';
import { createSqliteBackup } from '../src/ops/sqlite-backup.js';

test('sqlite backup is integrity-checked, checksummed, and pruned by retention', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-backup-'));
  const source=join(root,'lantern.sqlite');
  const manager=new SqliteStorageManager({path:source});
  try {
    await manager.accountStore.register({email:'backup@example.com',password:'safe password 12345'});
  } finally { manager.close(); }
  try {
    const a=await createSqliteBackup({sourcePath:source,backupDir:join(root,'backups'),now:new Date('2026-09-18T10:00:00Z'),retentionCount:2});
    const b=await createSqliteBackup({sourcePath:source,backupDir:join(root,'backups'),now:new Date('2026-09-19T10:00:00Z'),retentionCount:2});
    const c=await createSqliteBackup({sourcePath:source,backupDir:join(root,'backups'),now:new Date('2026-09-20T10:00:00Z'),retentionCount:2});
    assert.equal(a.integrity,'ok');
    assert.match(c.sha256,/^[a-f0-9]{64}$/);
    const dbs=(await readdir(join(root,'backups'))).filter(x=>x.endsWith('.sqlite'));
    assert.equal(dbs.length,2);
    const all=await readdir(join(root,'backups'));
    assert.equal(all.some(x=>x.endsWith('-wal')||x.endsWith('-shm')),false);
    assert.equal(dbs.some(x=>x.includes('2026-09-18')),false);
    assert.equal(b.integrity,'ok');
  } finally { await rm(root,{recursive:true,force:true}); }
});
