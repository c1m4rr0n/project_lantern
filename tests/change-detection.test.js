import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMaterialChanges, materialSnapshot } from '../src/domain/change-detection.js';

test('material change detection reports deadline and resource changes but ignores array ordering',()=>{
  const before={id:'n1',title:'Cloud support',deadline:'2026-10-01',naics:['541512','541519'],resourceLinks:['https://a','https://b'],placeOfPerformance:{state:'PR',city:'San Juan'},active:true};
  const reordered={...before,naics:['541519','541512'],resourceLinks:['https://b','https://a']};
  assert.equal(detectMaterialChanges(before,reordered),null);
  const after={...before,deadline:'2026-10-08',resourceLinks:['https://b','https://c']};
  const event=detectMaterialChanges(before,after,{detectedAt:'2026-09-18T20:00:00Z'});
  assert.equal(event.changes.length,2);
  assert.equal(event.changes.find(x=>x.field==='deadline').after,'2026-10-08');
  const links=event.changes.find(x=>x.field==='resourceLinks');
  assert.deepEqual(links.added,['https://c']);
  assert.deepEqual(links.removed,['https://a']);
  assert.equal(event.acknowledgedAt,null);
});

test('material snapshot excludes enrichment and local workflow fields',()=>{
  const snapshot=materialSnapshot({id:'1',title:'A',description:'secret long text',requirements:[{text:'x'}],enrichedAt:'now',decision:{status:'pursue'},changeWatch:{unreadCount:2}});
  assert.equal(snapshot.title,'A');
  assert.equal('description' in snapshot,false);
  assert.equal('requirements' in snapshot,false);
});
