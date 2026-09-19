import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

function safeStem(value) { return String(value).replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,120); }

export async function queueEmail({ outboxRoot, template, to, payload, idempotencyKey = randomUUID(), createdAt = new Date().toISOString() }) {
  if (!/^\S+@\S+\.\S+$/.test(String(to || ''))) throw new Error('valid email recipient required');
  if (!template) throw new Error('email template required');
  await mkdir(outboxRoot,{recursive:true});
  const message={idempotencyKey:String(idempotencyKey),channel:'email',template:String(template),to:String(to).trim().toLowerCase(),createdAt,payload:payload || {}};
  const name=`${Date.now()}-${safeStem(template)}-${safeStem(idempotencyKey)}.json`;
  await writeFile(join(outboxRoot,name),JSON.stringify(message,null,2),{flag:'wx',mode:0o600});
  return {queued:true,file:name,idempotencyKey:message.idempotencyKey};
}
