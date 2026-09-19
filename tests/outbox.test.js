import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliverOutbox, deliverOutboxFile } from '../src/notifications/outbox.js';

test('outbox moves successful messages to sent and leaves transient failures for retry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-outbox-'));
  try {
    await mkdir(root,{recursive:true});
    const payload={idempotencyKey:'daily:1:t',channel:'email',template:'daily-digest',to:'a@example.com',payload:{company:'A',scanned:1,strongCount:0,reviewCount:0,pursueCount:0,topMatches:[],upcomingDeadlines:[]}};
    await writeFile(join(root,'a.json'),JSON.stringify(payload));
    const sent=await deliverOutbox({outboxRoot:root,sender:async()=>({id:'x',provider:'fake'}),now:new Date('2026-09-18T13:00:00Z')});
    assert.equal(sent.sent,1);
    assert.equal((await readdir(join(root,'sent'))).length,1);
    const archived=JSON.parse(await readFile(join(root,'sent','a.json'),'utf8'));
    assert.equal(archived.receipt.id,'x');

    await writeFile(join(root,'b.json'),JSON.stringify({...payload,idempotencyKey:'daily:2:t'}));
    const failed=await deliverOutbox({outboxRoot:root,sender:async()=>{throw new Error('network down');}});
    assert.equal(failed.failed,1);
    assert.equal((await readdir(root)).includes('b.json'),true);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('auth email payload is redacted after successful delivery',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-outbox-sensitive-'));
  try {
    const message={idempotencyKey:'verify:1',channel:'email',template:'verify-email',to:'a@example.com',payload:{link:'https://example.com/auth.html?verify=super-secret-token',expiresIn:'24 hours'}};
    await writeFile(join(root,'verify.json'),JSON.stringify(message));
    const result=await deliverOutbox({outboxRoot:root,sender:async()=>({id:'sent-1',provider:'fake'})});
    assert.equal(result.sent,1);
    const archived=JSON.parse(await readFile(join(root,'sent','verify.json'),'utf8'));
    assert.deepEqual(archived.payload,{redacted:true});
    assert.equal(JSON.stringify(archived).includes('super-secret-token'),false);
  } finally { await rm(root,{recursive:true,force:true}); }
});


test('a queued auth email can be claimed for immediate delivery exactly once',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-outbox-claim-'));
  try {
    const message={idempotencyKey:'verify:claim',channel:'email',template:'verify-email',to:'a@example.com',payload:{link:'https://example.com/auth.html?verify=abc',expiresIn:'1 day'}};
    await writeFile(join(root,'verify.json'),JSON.stringify(message));
    let calls=0;
    const sender=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return{id:'sent-claim',provider:'fake'};};
    const [a,b]=await Promise.all([
      deliverOutboxFile({outboxRoot:root,file:'verify.json',sender}),
      deliverOutboxFile({outboxRoot:root,file:'verify.json',sender})
    ]);
    assert.equal(calls,1);
    assert.deepEqual(new Set([a.status,b.status]),new Set(['sent','skipped']));
    assert.equal((await readdir(join(root,'sent'))).includes('verify.json'),true);
  } finally { await rm(root,{recursive:true,force:true}); }
});
