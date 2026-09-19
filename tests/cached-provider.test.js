import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCachedProvider } from '../src/providers/cached-provider.js';

test('shared provider cache prevents repeated upstream calls inside TTL', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-cache-'));
  try{
    let calls=0, clock=100000;
    const provider=makeCachedProvider({path:join(root,'cache.json'),ttlMs:1000,now:()=>clock,provider:async()=>{calls++;return [{id:String(calls)}]}});
    assert.deepEqual(await provider(),[{id:'1'}]);
    clock+=500;
    assert.deepEqual(await provider(),[{id:'1'}]);
    assert.equal(calls,1);
    assert.equal(provider.meta().cache,'hit');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('cache serves bounded stale data when upstream temporarily fails', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-cache-'));
  try{
    let fail=false, clock=100000;
    const provider=makeCachedProvider({path:join(root,'cache.json'),ttlMs:100,maxStaleMs:5000,now:()=>clock,provider:async()=>{if(fail)throw new Error('upstream down');return [{id:'healthy'}]}});
    await provider(); fail=true; clock+=500;
    assert.deepEqual(await provider(),[{id:'healthy'}]);
    assert.equal(provider.meta().cache,'stale-fallback');
  }finally{await rm(root,{recursive:true,force:true});}
});
