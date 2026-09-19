import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecision } from '../src/domain/decision.js';
import { buildDigest } from '../src/services/digest.js';

test('decision accepts workflow states and trims notes',()=>{
  const d=validateDecision({status:' Pursue ',note:'  call partner  '},new Date('2026-09-18T12:00:00Z'));
  assert.deepEqual(d,{status:'pursue',note:'call partner',updatedAt:'2026-09-18T12:00:00.000Z'});
  assert.throws(()=>validateDecision({status:'won'}),/status must/);
});

test('passed opportunities stop appearing as digest actions',()=>{
  const now=new Date('2026-09-18T00:00:00Z');
  const base={deadline:'2026-09-25T00:00:00Z',match:{score:90,reasons:['r'],risks:[]}};
  const d=buildDigest({name:'ACME'},[
    {...base,id:'pass',title:'Passed',decision:{status:'pass'}},
    {...base,id:'go',title:'Pursue',decision:{status:'pursue'}}
  ],now);
  assert.equal(d.scanned,2); assert.equal(d.passedCount,1); assert.equal(d.pursueCount,1);
  assert.equal(d.strongCount,1); assert.equal(d.topMatches[0].id,'go');
});
