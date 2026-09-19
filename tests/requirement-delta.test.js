import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRequirementDelta } from '../src/domain/requirement-delta.js';

const req=(text,mandatory=true)=>({text,mandatory,source:'SAM.gov description · n1',status:'unverified',origin:'sam-extracted'});

test('requirement delta separates added removed and modified requirements deterministically',()=>{
  const before=[
    req('Offerors must provide three past performance examples.'),
    req('The proposal shall include a technical approach.'),
    req('Registration in System A is required.')
  ];
  const after=[
    req('Offerors must provide five past performance examples.'),
    req('The proposal shall include a technical approach.'),
    req('Offerors must hold a Secret facility clearance.')
  ];
  const delta=detectRequirementDelta(before,after,{profile:{hardBlockers:['secret facility clearance']}});
  assert.equal(delta.changed,true);
  assert.equal(delta.summary.modified,1);
  assert.equal(delta.summary.added,1);
  assert.equal(delta.summary.removed,1);
  assert.equal(delta.summary.blockers,1);
  assert.match(delta.modified[0].before.text,/three past performance/i);
  assert.match(delta.modified[0].after.text,/five past performance/i);
  assert.equal(delta.added[0].severity,'blocker');
  assert.deepEqual(delta.added[0].blockerHits,['secret facility clearance']);
});

test('identical requirement sets do not report a delta when order changes',()=>{
  const a=req('Vendor must submit pricing workbook.');
  const b=req('Vendor shall provide proof of registration.');
  const delta=detectRequirementDelta([a,b],[b,a],{profile:{hardBlockers:[]}});
  assert.equal(delta.changed,false);
  assert.deepEqual(delta.summary,{added:0,removed:0,modified:0,blockers:0,actions:0});
});
