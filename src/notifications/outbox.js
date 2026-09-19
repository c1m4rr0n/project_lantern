import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderDigestEmail } from './digest-email.js';
import { renderPasswordResetEmail, renderVerificationEmail } from './auth-email.js';

const inFlight=new Set();

function renderMessage(message) {
  if (message.channel !== 'email' || !message.to || !message.idempotencyKey) throw new Error('invalid outbox message');
  if (message.template === 'daily-digest') return { ...renderDigestEmail(message.payload || {}), sensitive:false };
  if (message.template === 'verify-email') return { ...renderVerificationEmail(message.payload || {}), sensitive:true };
  if (message.template === 'password-reset') return { ...renderPasswordResetEmail(message.payload || {}), sensitive:true };
  throw new Error('invalid outbox message');
}

async function ensureDirs(outboxRoot) {
  const dirs={sent:join(outboxRoot,'sent'),failed:join(outboxRoot,'failed')};
  await Promise.all(Object.values(dirs).map(path=>mkdir(path,{recursive:true})));
  return dirs;
}

export async function deliverOutboxFile({ outboxRoot, file, sender, now=new Date() }) {
  const claim=`${outboxRoot}\0${file}`;
  if(inFlight.has(claim)) return {file,status:'skipped',reason:'already-in-flight'};
  inFlight.add(claim);
  try {
    const dirs=await ensureDirs(outboxRoot);
    const path=join(outboxRoot,file);
    let message;
    try { message=JSON.parse(await readFile(path,'utf8')); }
    catch(error) {
      if(error.code==='ENOENT') return {file,status:'skipped',reason:'missing'};
      throw error;
    }
    try {
      const rendered=renderMessage(message);
      const receipt=await sender({...message,subject:rendered.subject,html:rendered.html,text:rendered.text});
      const completed={...message,deliveredAt:now.toISOString(),receipt};
      if (rendered.sensitive) completed.payload={redacted:true};
      await writeFile(path,JSON.stringify(completed,null,2),{mode:0o600});
      await rename(path,join(dirs.sent,file));
      return {file,status:'sent',provider:receipt.provider,id:receipt.id};
    } catch(error) {
      if(error.message==='invalid outbox message') await rename(path,join(dirs.failed,file));
      return {file,status:'failed',error:error.message};
    }
  } finally {
    inFlight.delete(claim);
  }
}

export async function deliverOutbox({ outboxRoot, sender, limit=100, now=new Date() }) {
  await ensureDirs(outboxRoot);
  const files=(await readdir(outboxRoot)).filter(x=>x.endsWith('.json')).sort().slice(0,Math.max(1,Number(limit)||100));
  const results=[];
  for (const file of files) results.push(await deliverOutboxFile({outboxRoot,file,sender,now}));
  const processed=results.filter(x=>x.status!=='skipped');
  return {
    ok:processed.every(x=>x.status==='sent'),
    processed:processed.length,
    sent:processed.filter(x=>x.status==='sent').length,
    failed:processed.filter(x=>x.status==='failed').length,
    results
  };
}
