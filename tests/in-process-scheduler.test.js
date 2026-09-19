import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOperationalTick } from '../src/ops/in-process-scheduler.js';

function base(root, counters) {
  return {
    accountStore:{}, tenantStoreFor:()=>({}), provider:async()=>[], providerName:'mock', seedOpportunities:[],
    outboxRoot:join(root,'outbox'), dataRoot:root, emailSender:async()=>({id:'x',provider:'fake'}), storageDriver:'sqlite',
    dailyHourUtc:12, backupHourUtc:13, emailEveryMs:5*60_000, retryMs:10*60_000,
    runDailyFn:async()=>{counters.daily++;return {ok:true,queued:1,skipped:0,finishedAt:new Date().toISOString()};},
    deliverOutboxFn:async()=>{counters.email++;return {ok:true,processed:1,sent:1,failed:0};},
    backupFn:async()=>{counters.backup++;return {file:`backup-${counters.backup}.sqlite`,integrity:'ok'};}
  };
}

test('scheduler persists daily/backup idempotency across ticks and restarts', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-scheduler-')); const counters={daily:0,email:0,backup:0};
  try {
    const opts=base(root,counters);
    let result=await runOperationalTick({...opts,now:new Date('2026-09-18T12:00:00Z')});
    assert.equal(counters.daily,1); assert.equal(counters.email,1); assert.equal(counters.backup,0);
    assert.deepEqual(result.actions.map(x=>x.task),['daily','email']);

    await runOperationalTick({...opts,now:new Date('2026-09-18T12:01:00Z')});
    assert.equal(counters.daily,1); assert.equal(counters.email,1); assert.equal(counters.backup,0);

    await runOperationalTick({...opts,now:new Date('2026-09-18T13:01:00Z')});
    assert.equal(counters.daily,1); assert.equal(counters.email,2); assert.equal(counters.backup,1);

    // A fresh call reads persisted state and does not duplicate completed daily tasks.
    await runOperationalTick({...base(root,counters),now:new Date('2026-09-18T13:02:00Z')});
    assert.equal(counters.daily,1); assert.equal(counters.backup,1);
    const state=JSON.parse(await readFile(join(root,'ops','scheduler-state.json'),'utf8'));
    assert.equal(state.daily.completedDate,'2026-09-18');
    assert.equal(state.backup.completedDate,'2026-09-18');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('scheduler backs off a failed daily task and retries after retry window', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-scheduler-retry-')); let attempts=0;
  try {
    const counters={daily:0,email:0,backup:0}; const opts=base(root,counters);
    opts.runDailyFn=async()=>{attempts++;if(attempts===1)throw new Error('provider down');return {ok:true,queued:0,skipped:0};};
    let result=await runOperationalTick({...opts,now:new Date('2026-09-18T12:00:00Z')});
    assert.equal(attempts,1); assert.equal(result.actions.find(x=>x.task==='daily').status,'failed');
    await runOperationalTick({...opts,now:new Date('2026-09-18T12:05:00Z')});
    assert.equal(attempts,1);
    result=await runOperationalTick({...opts,now:new Date('2026-09-18T12:11:00Z')});
    assert.equal(attempts,2); assert.equal(result.actions.find(x=>x.task==='daily').status,'ok');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('scheduler reports partial email delivery as unhealthy for the tick', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-scheduler-email-partial-'));
  try {
    const counters={daily:0,email:0,backup:0}; const opts=base(root,counters);
    opts.deliverOutboxFn=async()=>({ok:false,processed:2,sent:1,failed:1});
    const result=await runOperationalTick({...opts,now:new Date('2026-09-18T00:00:00Z'),dailyHourUtc:23,backupHourUtc:23});
    assert.equal(result.ok,false);
    assert.equal(result.actions.length,1);
    assert.equal(result.actions[0].task,'email');
    assert.equal(result.actions[0].status,'partial');
    assert.match(result.state.email.lastError,/1 delivery failure/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
