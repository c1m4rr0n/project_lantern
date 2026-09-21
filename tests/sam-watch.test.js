import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSamNoticeSearchUrl, fetchSamOpportunityById, SamWatchCache } from '../src/providers/sam-watch.js';

test('SAM watch query uses notice id and a narrow posted-date window',()=>{
  const url=buildSamNoticeSearchUrl({apiKey:'secret',noticeId:'abc-123',postedDate:'2026-05-04',now:new Date('2026-09-18T00:00:00Z')});
  assert.equal(url.hostname,'api.sam.gov');
  assert.equal(url.searchParams.get('noticeid'),'abc-123');
  assert.equal(url.searchParams.get('postedFrom'),'05/03/2026');
  assert.equal(url.searchParams.get('postedTo'),'05/05/2026');
  assert.equal(url.searchParams.get('limit'),'1');
});

test('SAM watch fetch normalizes the latest public opportunity record',async()=>{
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>({opportunitiesData:[{noticeId:'n1',title:'Updated title',solicitationNumber:'S-1',postedDate:'2026-05-04',responseDeadLine:'2026-10-01',naicsCode:'541512',active:'Yes',resourceLinks:['https://example.test/a']} ]})});
  const item=await fetchSamOpportunityById({apiKey:'secret',noticeId:'n1',postedDate:'2026-05-04',fetchImpl});
  assert.equal(item.id,'n1');
  assert.equal(item.title,'Updated title');
  assert.deepEqual(item.naics,['541512']);
});

test('SAM watch cache deduplicates repeated checks inside TTL',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-watch-'));
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,status:200,json:async()=>({opportunitiesData:[{noticeId:'n1',title:'A',postedDate:'2026-05-04',active:'Yes'}]})};};
  try {
    const cache=new SamWatchCache({root,apiKey:'secret',ttlMs:60_000,now:()=>Date.parse('2026-09-18T20:00:00Z'),fetchImpl});
    const a=await cache.get({id:'n1',postedDate:'2026-05-04'});
    const b=await cache.get({id:'n1',postedDate:'2026-05-04'});
    assert.equal(calls,1);
    assert.equal(a.cache,'miss');
    assert.equal(b.cache,'hit');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('same-notice URL repair can explicitly bypass fresh metadata without losing ordinary cache reuse',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-watch-repair-'));let calls=0;
  try{
    const cache=new SamWatchCache({root,apiKey:'test-only',fetchImpl:async()=>new Response(JSON.stringify({opportunitiesData:[{noticeId:'n1',description:'https://api.sam.gov/desc/'+(++calls)}]}))});
    const first=await cache.get({id:'n1'});assert.equal((await cache.get({id:'n1'})).cache,'hit');
    const repaired=await cache.get({id:'n1',forceRefresh:true});assert.notEqual(first.item.descriptionUrl,repaired.item.descriptionUrl);assert.equal(calls,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
