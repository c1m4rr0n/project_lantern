import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=await mkdtemp(join(tmpdir(),'lantern-auth-smoke-'));
const port=18000+(process.pid%10000);
const base=`http://127.0.0.1:${port}`;
const email=`smoke-${process.pid}@example.com`;
const oldPassword='old strong password 123';
const newPassword='new strong password 456';
const secret=randomBytes(32).toString('base64url');
const cwd=fileURLToPath(new URL('..',import.meta.url));
const child=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,PORT:String(port),DATA_ROOT:root,STORAGE_DRIVER:'sqlite',DATA_PROVIDER:'mock',MARKET_PROVIDER:'mock',EMAIL_PROVIDER:'console',PUBLIC_BASE_URL:base,SESSION_SECRET:secret,COOKIE_SECURE:'false',AUTH_RATE_LIMIT:'100'},stdio:['ignore','pipe','pipe']});
let stderr=''; child.stderr.on('data',c=>{stderr+=c;});

async function request(path,{method='GET',payload,cookie}={}) {
  const headers={}; if(payload!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;
  const response=await fetch(base+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  return {response,data,cookie:(response.headers.get('set-cookie')||'').split(';')[0]||null};
}
async function waitReady(){for(let i=0;i<60;i++){try{const x=await fetch(base+'/api/ready');if(x.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`server did not become ready: ${stderr.slice(-1000)}`);}
async function tokenFromOutbox(template,param){const dir=join(root,'outbox');for(let i=0;i<30;i++){try{const files=(await readdir(dir)).filter(x=>x.endsWith('.json'));for(const file of files){const d=JSON.parse(await readFile(join(dir,file),'utf8'));if(d.template===template){const u=new URL(d.payload.link);return u.searchParams.get(param);}}}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error(`missing ${template} outbox message`);}
function expect(actual,expected,label){if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);}

try {
  await waitReady();
  let x=await request('/api/auth/register',{method:'POST',payload:{email,password:oldPassword}}); expect(x.response.status,201,'register');
  x=await request('/api/profile'); expect(x.response.status,401,'unverified access');
  const verifyToken=await tokenFromOutbox('verify-email','verify');
  x=await request('/api/auth/verify-email',{method:'POST',payload:{token:verifyToken}}); expect(x.response.status,200,'verify'); const oldCookie=x.cookie;
  x=await request('/api/profile',{cookie:oldCookie}); expect(x.response.status,200,'verified access');
  x=await request('/api/auth/request-password-reset',{method:'POST',payload:{email}}); expect(x.response.status,200,'reset request');
  const resetToken=await tokenFromOutbox('password-reset','reset');
  x=await request('/api/auth/reset-password',{method:'POST',payload:{token:resetToken,password:newPassword}}); expect(x.response.status,200,'reset'); const newCookie=x.cookie;
  x=await request('/api/auth/me',{cookie:oldCookie}); expect(x.response.status,401,'old session revocation');
  x=await request('/api/auth/me',{cookie:newCookie}); expect(x.response.status,200,'new session');
  x=await request('/api/auth/login',{method:'POST',payload:{email,password:oldPassword}}); expect(x.response.status,401,'old password rejected');
  x=await request('/api/auth/login',{method:'POST',payload:{email,password:newPassword}}); expect(x.response.status,200,'new password accepted');
  console.log(JSON.stringify({ok:true,register:201,unverifiedAccess:401,verifiedAccess:200,oldSessionAfterReset:401,newSessionAfterReset:200,oldPasswordLogin:401,newPasswordLogin:200},null,2));
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve=>{const t=setTimeout(resolve,1000);child.once('exit',()=>{clearTimeout(t);resolve();});});
  await rm(root,{recursive:true,force:true});
}
