import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageManager } from '../src/storage/sqlite-storage.js';
import { createSessionToken, verifySessionToken } from '../src/auth/session.js';

async function withStore(fn) {
  const root=await mkdtemp(join(tmpdir(),'lantern-account-security-'));
  const storage=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try { await fn(storage); }
  finally { storage.close(); await rm(root,{recursive:true,force:true}); }
}

test('email verification tokens are one-time, expire, and store only hashes', async()=>withStore(async storage=>{
  const user=await storage.accountStore.register({email:'verify@example.com',password:'strong password 123'});
  assert.equal(user.emailVerifiedAt,null);
  const issued=await storage.accountStore.issueEmailVerification({email:user.email,now:new Date('2026-09-18T12:00:00Z'),ttlMs:60_000});
  assert.ok(issued.token.length>=40);
  const raw=storage.db.prepare('SELECT token_hash FROM auth_tokens WHERE id=?').get(issued.tokenId);
  assert.notEqual(raw.token_hash,issued.token);

  const verified=await storage.accountStore.verifyEmailToken(issued.token,{now:new Date('2026-09-18T12:00:30Z')});
  assert.ok(verified.emailVerifiedAt);
  assert.equal(await storage.accountStore.verifyEmailToken(issued.token,{now:new Date('2026-09-18T12:00:31Z')}),null);

  const second=await storage.accountStore.register({email:'expire@example.com',password:'strong password 456'});
  const expiring=await storage.accountStore.issueEmailVerification({email:second.email,now:new Date('2026-09-18T12:00:00Z'),ttlMs:60_000});
  assert.equal(await storage.accountStore.verifyEmailToken(expiring.token,{now:new Date('2026-09-18T12:01:01Z')}),null);
}));

test('password reset changes password, verifies email possession, and increments session version', async()=>withStore(async storage=>{
  const user=await storage.accountStore.register({email:'reset@example.com',password:'old strong password'});
  const before=await storage.accountStore.authenticate({email:user.email,password:'old strong password'});
  const secret='s'.repeat(32);
  const oldToken=createSessionToken({userId:before.id,tenantId:before.tenantId,email:before.email,sessionVersion:before.sessionVersion},secret);
  assert.equal(verifySessionToken(oldToken,secret).sessionVersion,1);

  const reset=await storage.accountStore.issuePasswordReset({email:user.email,now:new Date('2026-09-18T12:00:00Z'),ttlMs:60_000});
  const changed=await storage.accountStore.resetPasswordWithToken(reset.token,'new strong password 123',{now:new Date('2026-09-18T12:00:30Z')});
  assert.equal(changed.sessionVersion,2);
  assert.ok(changed.emailVerifiedAt);
  assert.equal(await storage.accountStore.authenticate({email:user.email,password:'old strong password'}),null);
  assert.equal((await storage.accountStore.authenticate({email:user.email,password:'new strong password 123'})).sessionVersion,2);
  assert.equal(await storage.accountStore.resetPasswordWithToken(reset.token,'another strong password 123',{now:new Date('2026-09-18T12:00:40Z')}),null);

  const identity=await storage.accountStore.getSessionIdentity(user.id);
  const decoded=verifySessionToken(oldToken,secret);
  assert.notEqual(Number(decoded.sessionVersion),Number(identity.sessionVersion));
}));

test('issuing a newer token invalidates the previous unconsumed token', async()=>withStore(async storage=>{
  const user=await storage.accountStore.register({email:'rotate@example.com',password:'strong password 123'});
  const first=await storage.accountStore.issueEmailVerification({email:user.email,now:new Date('2026-09-18T12:00:00Z')});
  const second=await storage.accountStore.issueEmailVerification({email:user.email,now:new Date('2026-09-18T12:01:00Z')});
  assert.equal(await storage.accountStore.verifyEmailToken(first.token,{now:new Date('2026-09-18T12:02:00Z')}),null);
  assert.ok(await storage.accountStore.verifyEmailToken(second.token,{now:new Date('2026-09-18T12:02:00Z')}));
}));
