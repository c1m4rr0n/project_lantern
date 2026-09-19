import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TenantJsonStore } from '../src/storage/tenant-json-store.js';
import { OpportunityService } from '../src/services/opportunities.js';

test('enrichment persists description and auditable requirement candidates', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-enrich-'));
  const store=new TenantJsonStore({root,tenantId:'tenant-12345678',seedProfile:{name:'Acme',naics:['541512'],capabilities:['cloud support'],setAsides:[],regions:['remote'],negativeKeywords:[]},seedOpportunities:[{id:'n1',title:'Cloud support',description:'',descriptionUrl:'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=n1',type:'Solicitation',naics:['541512'],setAside:'',placeOfPerformance:{state:''},requirements:[]}]});
  const detailProvider={get:async()=>({description:'The contractor shall provide cloud support. Offerors must submit a technical proposal.',cache:'miss',fetchedAt:'2026-09-18T12:00:00Z'})};
  const service=new OpportunityService({store,provider:async()=>[],detailProvider});
  const item=await service.enrich('n1');
  assert.equal(item.requirements.length,2);
  assert.match(item.description,/cloud support/);
  assert.equal(item.enrichment.source,'sam.gov');
  assert.ok(item.match.score >= 25);
});


test('enrichment never deletes an existing compliance matrix when no new candidate is found', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-enrich-preserve-'));
  const existing={text:'Pricing workbook must be submitted.',mandatory:true,source:'Attachment B',status:'missing'};
  const store=new TenantJsonStore({root,tenantId:'tenant-abcdefgh',seedProfile:{name:'Acme',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:['remote'],negativeKeywords:[]},seedOpportunities:[{id:'n2',title:'Cloud',description:'General background information.',descriptionUrl:'',type:'Solicitation',naics:['541512'],setAside:'',placeOfPerformance:{state:''},requirements:[existing]}]});
  const service=new OpportunityService({store,provider:async()=>[]});
  const item=await service.enrich('n2');
  assert.equal(item.requirements.length,1);
  assert.equal(item.requirements[0].text,existing.text);
});

test('feed sync refreshes metadata without deleting prior enrichment', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-sync-preserve-'));
  const enriched={id:'n3',title:'Old title',description:'Official enriched text',descriptionUrl:'https://api.sam.gov/desc/n3',requirements:[{text:'Must submit pricing.',mandatory:true,status:'missing'}],enrichedAt:'2026-09-18T12:00:00Z',enrichment:{source:'sam.gov'}};
  const store=new TenantJsonStore({root,tenantId:'tenant-preserve1',seedProfile:{name:'Acme',naics:['541512'],capabilities:['cloud'],setAsides:[],regions:[],negativeKeywords:[]},seedOpportunities:[enriched]});
  const provider=async()=>[{id:'n3',title:'Updated title',description:'',descriptionUrl:'https://api.sam.gov/desc/n3',requirements:[],deadline:'2026-10-01'}];
  const service=new OpportunityService({store,provider});
  await service.sync();
  const item=await store.findOpportunity('n3');
  assert.equal(item.title,'Updated title');
  assert.equal(item.description,'Official enriched text');
  assert.equal(item.requirements.length,1);
  assert.equal(item.enrichment.source,'sam.gov');
});
