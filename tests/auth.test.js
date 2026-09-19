import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { createSessionToken, verifySessionToken } from '../src/auth/session.js';

test('passwords are salted and verify without storing plaintext', async()=>{
  const a=await hashPassword('correct horse battery staple');
  const b=await hashPassword('correct horse battery staple');
  assert.notEqual(a,b);
  assert.equal(await verifyPassword('correct horse battery staple',a),true);
  assert.equal(await verifyPassword('wrong password',a),false);
  assert.equal(a.includes('correct horse'),false);
});

test('signed sessions reject tampering and expiry',()=>{
  const secret='x'.repeat(32);
  const token=createSessionToken({userId:'u1',tenantId:'tenant-12345678',email:'a@example.com'},secret,{now:1000,ttlSeconds:60});
  assert.equal(verifySessionToken(token,secret,{now:2000}).tenantId,'tenant-12345678');
  assert.equal(verifySessionToken(token+'x',secret,{now:2000}),null);
  assert.equal(verifySessionToken(token,secret,{now:62000}),null);
});
