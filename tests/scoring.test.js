import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOpportunity } from '../src/domain/scoring.js';

const profile={naics:['541512'],capabilities:['cloud migration','cybersecurity assessment'],setAsides:['small business'],regions:['PR','remote'],negativeKeywords:['janitorial']};
const now=new Date('2026-09-18T12:00:00Z');

test('highly relevant opportunity scores strongly',()=>{
 const result=scoreOpportunity(profile,{title:'Cloud migration cybersecurity assessment',description:'cloud migration and cybersecurity assessment',naics:['541512'],setAside:'Small Business',placeOfPerformance:{state:'PR'},deadline:'2026-10-18T12:00:00Z',type:'Solicitation'},now);
 assert.ok(result.score>=75,result.score); assert.equal(result.recommendation,'review-now');
});

test('negative keyword and wrong NAICS lower the score',()=>{
 const result=scoreOpportunity(profile,{title:'Janitorial building support',description:'janitorial services',naics:['561720'],setAside:'Small Business',placeOfPerformance:{state:'TX'},deadline:'2026-10-18T12:00:00Z',type:'Solicitation'},now);
 assert.ok(result.score<55,result.score); assert.ok(result.risks.some(x=>x.includes('Negative keyword')));
});

test('hard blocker forces skip with auditable blocker evidence',()=>{
 const result=scoreOpportunity({...profile,hardBlockers:['secret facility clearance']},{title:'Cloud migration support',description:'Offeror must hold a Secret Facility Clearance.',naics:['541512'],setAside:'Small Business',placeOfPerformance:{state:'PR'},deadline:'2026-10-18T12:00:00Z',type:'Solicitation'},now);
 assert.equal(result.score,0);
 assert.equal(result.recommendation,'skip');
 assert.equal(result.blocked,true);
 assert.deepEqual(result.blockers,['secret facility clearance']);
 assert.ok(result.risks[0].includes('Hard blocker'));
});
