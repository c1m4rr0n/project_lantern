import test from 'node:test';
import assert from 'node:assert/strict';
import { OpportunityService, isDemoSeedOpportunity } from '../src/services/opportunities.js';

const demo={id:'mock-001',solicitationNumber:'DEMO-2026-001',agency:'DEMO FEDERAL AGENCY',title:'Demo',type:'Solicitation',naics:[],requirements:[]};
const real={id:'real-001',solicitationNumber:'FAKE-REAL-001',agency:'Real Agency',title:'Real',type:'Solicitation',naics:[],requirements:[]};

function storeWith(items){
  let current=structuredClone(items);
  return {
    async getProfile(){return{name:'ACME',naics:['541512'],capabilities:[],setAsides:[],regions:[],negativeKeywords:[],hardBlockers:[]};},
    async getOpportunities(){return structuredClone(current);},
    async saveOpportunities(next){current=structuredClone(next);return next;},
    async getDecisions(){return{};},
    async getOpportunityChanges(){return{};},
    snapshot(){return current;}
  };
}

test('demo seed detector recognizes only explicit internal demo rows',()=>{
  assert.equal(isDemoSeedOpportunity(demo),true);
  assert.equal(isDemoSeedOpportunity(real),false);
});

test('real-provider opportunity service hides and purges persisted demo seed rows',async()=>{
  const store=storeWith([demo,real]);
  const service=new OpportunityService({store,provider:async()=>[real],excludeDemoSeed:true});
  const listed=await service.list();
  assert.deepEqual(listed.map(x=>x.id),['real-001']);
  await service.sync();
  assert.deepEqual(store.snapshot().map(x=>x.id),['real-001']);
});

test('mock-provider opportunity service may still expose demo fixtures',async()=>{
  const store=storeWith([demo]);
  const service=new OpportunityService({store,provider:async()=>[demo],excludeDemoSeed:false});
  const listed=await service.list();
  assert.equal(listed.length,1);
  assert.equal(listed[0].id,'mock-001');
});
