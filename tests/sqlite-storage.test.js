import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStorageManager } from '../src/storage/sqlite-storage.js';

test('sqlite storage persists accounts and isolates tenant documents', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-sqlite-'));
  const path=join(root,'lantern.sqlite');
  let manager;
  try {
    manager=new SqliteStorageManager({path});
    const alpha=await manager.accountStore.register({email:'alpha@example.com',password:'a very good password 123'});
    const beta=await manager.accountStore.register({email:'beta@example.com',password:'another good password 123'});
    assert.equal((await manager.accountStore.authenticate({email:'ALPHA@example.com',password:'a very good password 123'})).tenantId,alpha.tenantId);
    assert.equal(await manager.accountStore.authenticate({email:'alpha@example.com',password:'wrong password'}),null);
    assert.equal((await manager.accountStore.listUsers()).length,2);

    const a=manager.tenantStore(alpha.tenantId,{seedOpportunities:[{id:'seed'}]});
    const b=manager.tenantStore(beta.tenantId,{seedOpportunities:[{id:'seed'}]});
    await a.saveProfile({name:'Alpha',naics:['541512'],capabilities:['cloud']});
    await b.saveProfile({name:'Beta',naics:['541611'],capabilities:['consulting']});
    await a.saveOpportunities([{id:'alpha-only'}]);
    await a.saveDecision('alpha-only',{status:'pursue',note:'go'});
    await a.saveVendors([{id:'v1',legalName:'Alpha Vendor',uei:'ABC123DEF456'}]);
    await a.appendVendorScreening('v1',{id:'s1',status:'clear',alert:false,acknowledgedAt:'2026-09-18T00:00:00Z'});
    assert.equal((await a.getProfile()).name,'Alpha');
    assert.equal((await b.getProfile()).name,'Beta');
    assert.deepEqual(await a.getOpportunities(),[{id:'alpha-only'}]);
    assert.deepEqual(await b.getOpportunities(),[{id:'seed'}]);
    assert.equal((await a.getDecisions())['alpha-only'].status,'pursue');
    assert.deepEqual(await b.getDecisions(),{});
    assert.equal((await a.getVendors())[0].legalName,'Alpha Vendor');
    assert.deepEqual(await b.getVendors(),[]);
    assert.equal((await a.getVendorScreenings('v1'))[0].status,'clear');
    assert.deepEqual(await b.getVendorScreenings(),{});

    manager.close(); manager=null;
    manager=new SqliteStorageManager({path});
    assert.equal((await manager.accountStore.listUsers()).length,2);
    assert.equal((await manager.tenantStore(alpha.tenantId).getProfile()).name,'Alpha');
  } finally {
    manager?.close();
    await rm(root,{recursive:true,force:true});
  }
});

test('sqlite tenant ids reject path-style and malformed identifiers', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-sqlite-id-'));
  const manager=new SqliteStorageManager({path:join(root,'db.sqlite')});
  try { assert.throws(()=>manager.tenantStore('../../etc/passwd'),/invalid tenant id/); }
  finally { manager.close(); await rm(root,{recursive:true,force:true}); }
});
