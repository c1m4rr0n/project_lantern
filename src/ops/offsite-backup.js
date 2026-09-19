import { createHash, createHmac } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { safeErrorCode } from '../security/events.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());

export function signedPut({env,key,bytes,now=new Date()}) {
  const base=new URL(env.OFFSITE_BACKUP_ENDPOINT);
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error('invalid_backup_endpoint');
  for(const name of ['BUCKET','REGION','ACCESS_KEY_ID','SECRET_ACCESS_KEY']) if(!env[`OFFSITE_BACKUP_${name}`])throw new Error('incomplete_backup_config');
  const url=new URL(base.href);
  url.pathname=base.pathname.replace(/\/$/,'')+'/'+[env.OFFSITE_BACKUP_BUCKET,...key.split('/')].map(encode).join('/');
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
  const day=stamp.slice(0,8), region=env.OFFSITE_BACKUP_REGION;
  const headers={'host':url.host,'x-amz-content-sha256':hash(bytes),'x-amz-date':stamp};
  if(env.OFFSITE_BACKUP_SESSION_TOKEN)headers['x-amz-security-token']=env.OFFSITE_BACKUP_SESSION_TOKEN;
  const names=Object.keys(headers).sort();
  const canonical=['PUT',url.pathname,'',names.map(n=>`${n}:${headers[n].trim()}\n`).join(''),names.join(';'),hash(bytes)].join('\n');
  const scope=`${day}/${region}/s3/aws4_request`;
  const signingKey=hmac(hmac(hmac(hmac('AWS4'+env.OFFSITE_BACKUP_SECRET_ACCESS_KEY,day),region),'s3'),'aws4_request');
  const signature=createHmac('sha256',signingKey).update(`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${hash(canonical)}`).digest('hex');
  headers.authorization=`AWS4-HMAC-SHA256 Credential=${env.OFFSITE_BACKUP_ACCESS_KEY_ID}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  return {url:url.href,headers};
}

export async function uploadVerifiedBackup({directory,manifest,env=process.env,fetchFn=fetch,now=new Date()}) {
  if(!/^lantern-.*\.sqlite$/.test(manifest.file)||basename(manifest.file)!==manifest.file||manifest.integrity!=='ok')throw new Error('invalid_backup_manifest');
  const path=join(directory,manifest.file), bytes=await readFile(path);
  if(hash(bytes)!==manifest.sha256||bytes.length!==manifest.bytes)throw new Error('backup_checksum_mismatch');
  const db=new DatabaseSync(path,{readOnly:true});
  try { if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('backup_integrity_failed'); } finally {db.close();}
  const prefix=String(env.OFFSITE_BACKUP_PREFIX||'exclusignal').replace(/^\/+|\/+$/g,'');
  for(const [file,payload] of [[manifest.file,bytes],[manifest.file+'.json',Buffer.from(JSON.stringify(manifest))]]) {
    const {url,headers}=signedPut({env,key:`${prefix}/${file}`,bytes:payload,now});
    const response=await fetchFn(url,{method:'PUT',headers,body:payload,signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!response.ok)throw new Error('offsite_upload_failed');
  }
}

export async function syncOffsiteBackups({dataRoot,env=process.env,fetchFn=fetch,now=new Date()}) {
  if(env.OFFSITE_BACKUP_ENABLED!=='true')return {enabled:false};
  const statePath=join(dataRoot,'ops','offsite-backup.json'), directory=join(dataRoot,'backups');
  let state={sent:[],pendingFiles:[],failures:0,expiredUnsent:0};
  try { state={...state,...JSON.parse(await readFile(statePath,'utf8'))}; } catch(e){if(e.code!=='ENOENT')return {enabled:true,lastError:'unreadable_state'};}
  if(state.nextAttemptAt && Date.parse(state.nextAttemptAt)>now.getTime())return state;
  state.lastAttemptAt=now.toISOString();
  try {
    const files=(await readdir(directory)).filter(x=>/^lantern-.*\.sqlite\.json$/.test(x)).sort();
    state.expiredUnsent+=state.pendingFiles.filter(x=>!files.includes(x)).length;
    state.pendingFiles=files.filter(x=>!state.sent.includes(x));
    for(const file of [...state.pendingFiles]) {
      await uploadVerifiedBackup({directory,manifest:JSON.parse(await readFile(join(directory,file),'utf8')),env,fetchFn,now});
      state.sent.push(file);state.pendingFiles=state.pendingFiles.filter(x=>x!==file);state.lastSuccessAt=now.toISOString();
    }
    state.sent=state.sent.filter(x=>files.includes(x));state.failures=0;state.lastError=null;state.nextAttemptAt=null;
  } catch(error) {
    state.failures++;state.lastError=safeErrorCode(error);
    state.nextAttemptAt=new Date(now.getTime()+Math.min(3600000,60000*2**Math.min(state.failures,6))).toISOString();
  }
  state.pending=state.pendingFiles.length;
  try {await mkdir(join(dataRoot,'ops'),{recursive:true});await writeFile(statePath+'.tmp',JSON.stringify(state),{mode:0o600});await rename(statePath+'.tmp',statePath);} catch {return {...state,lastError:'status_write_failed'};}
  return state;
}
