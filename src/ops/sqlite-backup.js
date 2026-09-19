import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

function stamp(now) { return now.toISOString().replace(/[:.]/g,'-'); }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }

export async function createSqliteBackup({ sourcePath, backupDir, now = new Date(), retentionCount = 7 }) {
  await mkdir(backupDir, { recursive:true });
  await stat(sourcePath);
  const filename = `lantern-${stamp(now)}.sqlite`;
  const destination = join(backupDir, filename);
  const source = new DatabaseSync(sourcePath, { readOnly:true });
  let pagesCopied;
  try { pagesCopied = await backup(source, destination); }
  finally { source.close(); }

  const checkDb = new DatabaseSync(destination, { readOnly:true });
  let integrity;
  try { integrity = checkDb.prepare('PRAGMA integrity_check').get()?.integrity_check || 'unknown'; }
  finally { checkDb.close(); }
  await rm(`${destination}-wal`, { force:true });
  await rm(`${destination}-shm`, { force:true });
  if (integrity !== 'ok') throw new Error(`backup integrity check failed: ${integrity}`);

  const info = await stat(destination);
  const manifest = {
    createdAt:now.toISOString(),
    source:basename(sourcePath),
    file:filename,
    bytes:info.size,
    pagesCopied,
    sha256:await sha256(destination),
    integrity
  };
  await writeFile(`${destination}.json`, JSON.stringify(manifest, null, 2), { mode:0o600 });

  const files=(await readdir(backupDir)).filter(x=>/^lantern-.*\.sqlite$/.test(x)).sort().reverse();
  for (const old of files.slice(Math.max(1,Number(retentionCount)||7))) {
    await rm(join(backupDir, old), { force:true });
    await rm(join(backupDir, `${old}.json`), { force:true });
    await rm(join(backupDir, `${old}-wal`), { force:true });
    await rm(join(backupDir, `${old}-shm`), { force:true });
  }
  return manifest;
}
