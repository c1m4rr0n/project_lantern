import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSamDescription, safeSamDescriptionUrl, SamDetailCache } from '../src/providers/sam-detail.js';

test('description URL is restricted to official SAM API hosts and receives key',()=>{
  const url=safeSamDescriptionUrl('https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc','secret');
  assert.equal(url.hostname,'api.sam.gov');
  assert.equal(url.searchParams.get('api_key'),'secret');
  assert.throws(()=>safeSamDescriptionUrl('https://evil.example/x','secret'),{code:'enrichment_not_found'});
});

test('description fetch strips markup',async()=>{
  const fetchImpl=async()=>({ok:true,text:async()=>'<p>Offerors <b>must</b> submit a technical proposal.</p><script>bad()</script>'});
  const text=await fetchSamDescription({apiKey:'x',descriptionUrl:'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc',fetchImpl});
  assert.equal(text,'Offerors must submit a technical proposal.');
});

test('detail cache avoids repeated upstream calls',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-detail-'));
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,text:async()=>'<p>Vendor shall provide support.</p>'};};
  const cache=new SamDetailCache({root,apiKey:'x',fetchImpl,now:()=>Date.parse('2026-09-18T12:00:00Z')});
  const input={id:'abc-1',descriptionUrl:'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc-1'};
  const a=await cache.get(input); const b=await cache.get(input);
  assert.equal(calls,1); assert.equal(a.description,'Vendor shall provide support.'); assert.equal(b.cache,'hit');
  assert.ok(JSON.parse(await readFile(join(root,'abc-1.json'),'utf8')).description);
});

test('detail cache can force a fresh fetch for amendment analysis',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-detail-force-'));
  let calls=0;
  const fetchImpl=async()=>({ok:true,text:async()=>`<p>Vendor must provide ${++calls===1?'three':'five'} references.</p>`});
  const cache=new SamDetailCache({root,apiKey:'x',fetchImpl,now:()=>Date.parse('2026-09-18T12:00:00Z')});
  const input={id:'abc-2',descriptionUrl:'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc-2'};
  const first=await cache.get(input);
  const second=await cache.get({...input,forceRefresh:true});
  assert.equal(calls,2);
  assert.match(first.description,/three references/i);
  assert.match(second.description,/five references/i);
  assert.equal(second.cache,'refresh');
});
