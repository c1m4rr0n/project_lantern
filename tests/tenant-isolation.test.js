import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TenantJsonStore } from '../src/storage/tenant-json-store.js';

test('tenant stores cannot see each other profiles or opportunity state', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-tenants-'));
  try{
    const a=new TenantJsonStore({root,tenantId:'tenant-aaaaaaaa',seedOpportunities:[{id:'seed'}]});
    const b=new TenantJsonStore({root,tenantId:'tenant-bbbbbbbb',seedOpportunities:[{id:'seed'}]});
    await a.saveProfile({name:'Alpha',naics:['541512'],capabilities:['cloud']});
    await b.saveProfile({name:'Beta',naics:['541611'],capabilities:['consulting']});
    await a.saveOpportunities([{id:'alpha-only'}]);
    assert.equal((await a.getProfile()).name,'Alpha');
    assert.equal((await b.getProfile()).name,'Beta');
    assert.deepEqual(await a.getOpportunities(),[{id:'alpha-only'}]);
    assert.deepEqual(await b.getOpportunities(),[{id:'seed'}]);
    await a.saveDecision('seed',{status:'pass',note:'not our fit'});
    assert.equal((await a.getDecisions()).seed.status,'pass');
    assert.deepEqual(await b.getDecisions(),{});
  }finally{await rm(root,{recursive:true,force:true});}
});

test('tenant ids reject path traversal',()=>{
  assert.throws(()=>new TenantJsonStore({root:'/tmp/x',tenantId:'../../etc/passwd'}),/invalid tenant id/);
});
