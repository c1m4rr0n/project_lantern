import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/domain/profile.js';

test('profile validation keeps only supported fields and valid NAICS',()=>{
  const p=validateProfile({name:' ACME ',naics:['541512','bad'],capabilities:['Cloud Migration','Cloud Migration'],regions:['PR'],hardBlockers:['Secret facility clearance'],admin:true});
  assert.equal(p.name,'ACME'); assert.deepEqual(p.naics,['541512']); assert.deepEqual(p.capabilities,['Cloud Migration']); assert.equal('admin' in p,false);
  assert.deepEqual(p.hardBlockers,['Secret facility clearance']);
});

test('profile requires useful matching data',()=>{
  assert.throws(()=>validateProfile({name:'ACME',naics:[],capabilities:[]}),/at least one/i);
});
