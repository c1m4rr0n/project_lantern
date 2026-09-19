import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteBackup } from '../src/ops/sqlite-backup.js';

const ROOT=fileURLToPath(new URL('..', import.meta.url));
const dataRoot=resolve(process.env.DATA_ROOT || join(ROOT,'data'));
const driver=process.env.STORAGE_DRIVER || 'sqlite';
if (driver !== 'sqlite') throw new Error('backup script currently requires STORAGE_DRIVER=sqlite');
const manifest=await createSqliteBackup({
  sourcePath:join(dataRoot,'lantern.sqlite'),
  backupDir:join(dataRoot,'backups'),
  retentionCount:Number(process.env.BACKUP_RETENTION_COUNT || 7)
});
console.log(JSON.stringify({ok:true,file:manifest.file,bytes:manifest.bytes,sha256:manifest.sha256,integrity:manifest.integrity}));
