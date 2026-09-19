import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

const cleanEmail = value => String(value ?? '').trim().toLowerCase();
const tokenHash = token => createHash('sha256').update(String(token)).digest('hex');

function publicUser(user) {
  if (!user) return null;
  return { id:user.id, tenantId:user.tenantId, email:user.email, createdAt:user.createdAt, emailVerifiedAt:user.emailVerifiedAt || null, sessionVersion:Number(user.sessionVersion || 1) };
}

export class AccountStore {
  constructor({ path }) { this.path = path; this.queue = Promise.resolve(); }

  async #read() {
    try {
      const data=JSON.parse(await readFile(this.path, 'utf8'));
      data.users=(data.users || []).map(u=>({...u,emailVerifiedAt:u.emailVerifiedAt === undefined ? u.createdAt : u.emailVerifiedAt,sessionVersion:Number(u.sessionVersion || 1)}));
      data.tokens=data.tokens || [];
      return data;
    } catch (error) { if (error.code === 'ENOENT') return { users: [], tokens:[] }; throw error; }
  }

  async #write(data) {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, this.path);
  }

  async #mutate(fn) {
    const operation=this.queue.then(async()=>{const data=await this.#read();const result=await fn(data);await this.#write(data);return result;});
    this.queue=operation.catch(()=>{});
    return operation;
  }

  async register({ email, password }) {
    const normalized = cleanEmail(email);
    if (!/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 254) throw new Error('valid email is required');
    const passwordHash=await hashPassword(password);
    return this.#mutate(async data=>{
      if (data.users.some(u => u.email === normalized)) throw new Error('account already exists');
      const now = new Date().toISOString();
      const user = { id:randomUUID(),tenantId:randomUUID(),email:normalized,passwordHash,createdAt:now,emailVerifiedAt:null,sessionVersion:1 };
      data.users.push(user);
      return publicUser(user);
    });
  }

  async authenticate({ email, password }) {
    const data = await this.#read();
    const user = data.users.find(u => u.email === cleanEmail(email));
    if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
    return publicUser(user);
  }

  async getSessionIdentity(userId) { const data=await this.#read();return publicUser(data.users.find(u=>u.id===String(userId))); }
  async listUsers() { const data=await this.#read();return data.users.map(publicUser); }
  async count() { return (await this.#read()).users.length; }
  async deleteAccount(userId) {return this.#mutate(async data=>{data.users=data.users.filter(u=>u.id!==userId);data.tokens=data.tokens.filter(t=>t.accountId!==userId);});}

  async issueEmailVerification({email,now=new Date(),ttlMs=24*60*60*1000}) { return this.#issue({email,kind:'verify-email',now,ttlMs,skipVerified:true}); }
  async issuePasswordReset({email,now=new Date(),ttlMs=60*60*1000}) { return this.#issue({email,kind:'password-reset',now,ttlMs,skipVerified:false}); }

  async #issue({email,kind,now,ttlMs,skipVerified}) {
    return this.#mutate(async data=>{
      const user=data.users.find(u=>u.email===cleanEmail(email));
      if (!user || (skipVerified && user.emailVerifiedAt)) return null;
      const createdAt=now.toISOString();
      for (const t of data.tokens) if (t.accountId===user.id && t.kind===kind && !t.consumedAt) t.consumedAt=createdAt;
      const token=randomBytes(32).toString('base64url');
      const record={id:randomUUID(),accountId:user.id,kind,tokenHash:tokenHash(token),createdAt,expiresAt:new Date(now.getTime()+Math.max(60_000,Number(ttlMs)||60_000)).toISOString(),consumedAt:null};
      data.tokens.push(record);
      return {token,tokenId:record.id,kind,expiresAt:record.expiresAt,user:publicUser(user)};
    });
  }

  async verifyEmailToken(token,{now=new Date()}={}) {
    return this.#mutate(async data=>{
      const record=data.tokens.find(t=>t.kind==='verify-email'&&t.tokenHash===tokenHash(token));
      if (!record || record.consumedAt || new Date(record.expiresAt)<=now) return null;
      const user=data.users.find(u=>u.id===record.accountId); if(!user)return null;
      record.consumedAt=now.toISOString(); user.emailVerifiedAt=user.emailVerifiedAt || record.consumedAt;
      return publicUser(user);
    });
  }

  async resetPasswordWithToken(token,newPassword,{now=new Date()}={}) {
    const passwordHash=await hashPassword(newPassword);
    return this.#mutate(async data=>{
      const record=data.tokens.find(t=>t.kind==='password-reset'&&t.tokenHash===tokenHash(token));
      if (!record || record.consumedAt || new Date(record.expiresAt)<=now) return null;
      const user=data.users.find(u=>u.id===record.accountId); if(!user)return null;
      const at=now.toISOString();record.consumedAt=at;user.passwordHash=passwordHash;user.emailVerifiedAt=user.emailVerifiedAt||at;user.sessionVersion=Number(user.sessionVersion||1)+1;
      for(const t of data.tokens)if(t.accountId===user.id&&t.kind==='password-reset'&&!t.consumedAt)t.consumedAt=at;
      return publicUser(user);
    });
  }
}
