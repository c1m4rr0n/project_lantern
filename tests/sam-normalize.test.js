import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSamOpportunity } from '../src/providers/sam.js';

test('normalizes a SAM opportunity into internal schema',()=>{
 const x=normalizeSamOpportunity({noticeId:'abc',title:'Test',solicitationNumber:'S-1',type:'o',naicsCode:'541512',typeOfSetAsideDescription:'Small Business',placeOfPerformance:{state:{code:'PR'},city:{name:'San Juan'}},responseDeadLine:'2026-10-01T00:00:00Z'});
 assert.equal(x.id,'abc'); assert.equal(x.type,'Solicitation'); assert.deepEqual(x.naics,['541512']); assert.equal(x.placeOfPerformance.state,'PR');
});
