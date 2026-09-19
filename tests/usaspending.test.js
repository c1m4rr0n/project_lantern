import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUsaSpendingAwardRequest, summarizeAwards } from '../src/providers/usaspending.js';

test('builds a contract-award search request without credentials',()=>{
  const body=buildUsaSpendingAwardRequest({naics:'541512',years:3,now:new Date('2026-09-18T00:00:00Z')});
  assert.deepEqual(body.filters.award_type_codes,['A','B','C','D']);
  assert.deepEqual(body.filters.naics_codes,['541512']);
  assert.equal(body.filters.time_period[0].start_date,'2023-09-18');
  assert.equal(body.filters.time_period[0].end_date,'2026-09-18');
});

test('summarizes award samples',()=>{
  const x=summarizeAwards([
    {'Recipient Name':'A','Award Amount':100},
    {'Recipient Name':'A','Award Amount':200},
    {'Recipient Name':'B','Award Amount':50}
  ]);
  assert.equal(x.sampleCount,3); assert.equal(x.sampleValue,350); assert.equal(x.averageAward,350/3); assert.deepEqual(x.topRecipients[0],{name:'A',amount:300});
});
