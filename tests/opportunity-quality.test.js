import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreOpportunity} from '../src/domain/scoring.js';
import {qualityLabel,visibleOpportunities,selectedOpportunity,profileSignals,feedEmptyState} from '../public/opportunity-quality.js';
import {enrichmentFailure,officialSource} from '../public/enrichment-model.js';

test('forestry profile never promotes favorable hardware conditions as business relevance',()=>{
  const profile={naics:['115310'],capabilities:['forest inventory'],setAsides:['small business'],regions:[]};
  const hardware={title:'Navy hardware',naics:['332510'],type:'Solicitation',deadline:'2026-12-01',setAside:'small business'};
  const items=[hardware,{...hardware,setAside:''},{...hardware,setAside:'HUBZone'}].map((x,i)=>({...x,id:String(i),match:scoreOpportunity(profile,x,new Date('2026-09-21'))}));
  assert.deepEqual(items.map(x=>x.match.score),[45,35,30]);
  const summary={relevant:items.filter(x=>x.match.score>=55).length};
  assert.equal(summary.relevant,0);
  assert.deepEqual(visibleOpportunities(items),[]);
  assert.equal(selectedOpportunity(items,'relevant',null),null);
  assert.equal(feedEmptyState({configured:true,summary},'relevant').title,'No relevant opportunities found right now.');
  assert.equal(feedEmptyState({configured:true,summary},'relevant').explore,true);
  assert.equal(visibleOpportunities(items,'explore').length,3);
  assert.equal(selectedOpportunity(items,'explore',null),null);
  assert.equal(selectedOpportunity(items,'explore','0'),'0');
  for(const item of items){assert.equal(qualityLabel(item.match.score),'Low relevance');assert.deepEqual(profileSignals(item.match).business,[]);assert.ok(profileSignals(item.match).conditions.length);}
});

test('mixed feed defaults to Relevant, sorts best qualifying first, and keeps low results in Explore',()=>{
  const items=[63,45,82].map(score=>({id:String(score),match:{score}}));
  assert.deepEqual(visibleOpportunities(items).map(x=>x.id),['82','63']);
  assert.deepEqual(visibleOpportunities(items,'strong').map(x=>x.id),['82']);
  assert.deepEqual(visibleOpportunities(items,'explore').map(x=>x.id),['45']);
  assert.equal(selectedOpportunity(items,'relevant',null),'82');
  assert.equal(selectedOpportunity(items,'relevant','63'),'63');
  assert.equal(selectedOpportunity(items,'strong','63'),'82');
  assert.equal(selectedOpportunity(items,'explore','82'),null);
  assert.equal(selectedOpportunity(items,'explore','45'),'45');
});

test('quality boundaries and evidence grouping preserve scorer semantics',()=>{
  assert.deepEqual([0,54,55,74,75,100].map(qualityLabel),['Low relevance','Low relevance','Relevant','Relevant','Strong','Strong']);
  assert.deepEqual(profileSignals({reasons:['NAICS match: 115310','Capability terms matched: forestry','20 days remain before deadline']}),{business:['NAICS match: 115310','Capability terms matched: forestry'],conditions:['20 days remain before deadline']});
});

test('description failures have specific safe human messages with no unknown diagnostics',()=>{
  for(const [code,text] of [['rate_limited',/limiting/],['temporarily_unavailable',/temporarily/],['not_found',/unavailable/],['configuration',/operator attention/],['malformed',/could not read/]])assert.match(enrichmentFailure(new Error('enrichment_'+code)),text);
  assert.doesNotMatch(enrichmentFailure(new Error('upstream secret URL')),/secret URL/);
  assert.equal(officialSource({id:'f46cb63f872945eabdd2301fa97d4075',sourceUrl:'javascript:alert(1)'}),'https://sam.gov/opp/f46cb63f872945eabdd2301fa97d4075/view');
  assert.equal(officialSource({id:'invalid',sourceUrl:'https://evil.example'}),'');
});
