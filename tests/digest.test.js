import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest } from '../src/services/digest.js';

test('digest summarizes strong matches and near deadlines',()=>{
  const now=new Date('2026-09-18T00:00:00Z');
  const d=buildDigest({name:'ACME'},[
    {id:'1',title:'A',match:{score:90,reasons:['r'],risks:[]},deadline:'2026-09-25T00:00:00Z'},
    {id:'2',title:'B',match:{score:60,reasons:[],risks:[]},deadline:'2026-10-20T00:00:00Z'},
    {id:'3',title:'C',match:{score:20,reasons:[],risks:[]}}
  ],now);
  assert.equal(d.scanned,3); assert.equal(d.strongCount,1); assert.equal(d.reviewCount,1); assert.equal(d.deadlineCount,1); assert.equal(d.upcomingDeadlines[0].daysRemaining,7);
});

test('digest carries vendor exclusion-watch summary alongside opportunity data',()=>{
  const d=buildDigest({name:'ACME'},[],new Date('2026-09-18T00:00:00Z'),{total:2,excludedCount:1,possibleMatchCount:0,clearCount:1,unscreenedCount:0,alertCount:1,alerts:[{id:'v1',legalName:'Risk Vendor',status:'excluded',reason:'Exact UEI match'}]});
  assert.equal(d.vendorWatch.total,2);
  assert.equal(d.vendorWatch.excludedCount,1);
  assert.equal(d.vendorWatch.alerts[0].legalName,'Risk Vendor');
});
