import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SamDiscoveryPages,discoveryUrl} from '../src/providers/sam-discovery.js';
import {discoverOpportunities,discoveryConfig} from '../src/domain/discovery.js';
const args=()=>({query:{ncode:'541512',ptypes:['o','k','r','p']},from:new Date('2026-08-22'),to:new Date('2026-09-20'),limit:500,offset:0,budget:{requests:0,maxRequests:20,clock:Date.now,deadline:Date.now()+100000}});
const ok=()=>({ok:true,json:async()=>({opportunitiesData:[{noticeId:'notice-1',title:'Cloud',type:'o',naicsCode:'541512'}],totalRecords:1})});
async function temporary(t){const root=await mkdtemp(join(tmpdir(),'discovery-pages-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('SAM URL uses official v2 filters, repeated procurement types and page offset',()=>{
  const url=discoveryUrl({...args(),offset:2});assert.equal(url.origin,'https://api.sam.gov');assert.equal(url.pathname,'/opportunities/v2/search');
  assert.equal(url.searchParams.get('postedFrom'),'08/22/2026');assert.equal(url.searchParams.get('offset'),'2');assert.deepEqual(url.searchParams.getAll('ptype'),['o','k','r','p']);assert.equal(url.searchParams.has('api_key'),false);
});
test('exact public query cache reuse, persisted cache and distinct parameter identities',async t=>{
  const root=await temporary(t);let calls=0;const fetchImpl=async()=>{calls++;return ok();};
  const p=new SamDiscoveryPages({root,apiKey:'mock-credential',env:{DISCOVERY_REQUEST_INTERVAL_MS:0},fetchImpl});
  const a=args();assert.equal((await p.get(a)).cache,'miss');assert.equal(a.budget.requests,1);
  const b=args();assert.equal((await p.get(b)).cache,'hit');assert.equal(b.budget.requests,0);
  const restarted=new SamDiscoveryPages({root,apiKey:'other-mock-credential',fetchImpl});assert.equal((await restarted.get(args())).cache,'hit');
  await p.get({...args(),query:{ncode:'541511',ptypes:['o']}});await p.get({...args(),offset:1});assert.equal(calls,3);
  for(const file of await readdir(root)){const content=await readFile(join(root,file),'utf8');assert.doesNotMatch(content,/credential|api_key|profile|score/);}
});
test('concurrent exact queries coalesce but no tenant-scored results are cached',async t=>{
  let calls=0;const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',fetchImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return ok();}});
  const results=await Promise.all([p.get(args()),p.get(args())]);assert.equal(calls,1);assert.deepEqual(results.map(x=>x.cache).sort(),['miss','shared']);
});
test('transient retries are bounded and charged to request budget',async t=>{
  let calls=0;const waits=[];const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',env:{DISCOVERY_REQUEST_INTERVAL_MS:0},sleep:async ms=>waits.push(ms),fetchImpl:async()=>{calls++;return calls===3?ok():{ok:false,status:503};}});
  const a=args();await p.get(a);assert.equal(a.budget.requests,3);assert.deepEqual(waits,[500,1000]);
});
test('persistent 4xx is not retried, cached or treated as empty success',async t=>{
  let calls=0;const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',fetchImpl:async()=>{calls++;return{ok:false,status:403};}});
  await assert.rejects(p.get(args()),{code:'discovery_upstream_rejected'});assert.equal(calls,1);
});
test('only explicit documented SAM 404 No Data found is an empty first page',async t=>{
  const root=await temporary(t);let body='No Data found';
  const p=new SamDiscoveryPages({root,apiKey:'mock',env:{DISCOVERY_REQUEST_INTERVAL_MS:0},fetchImpl:async()=>({ok:false,status:404,text:async()=>body})});
  const empty=await p.get(args());assert.equal(empty.totalRecords,0);assert.deepEqual(empty.items,[]);
  await assert.rejects(p.get({...args(),offset:1}),{code:'discovery_upstream_rejected'});
  body='Gateway route not found';await assert.rejects(p.get({...args(),query:{ncode:'541511'}}),{code:'discovery_upstream_rejected'});
});
test('429 applies cooldown without retrying or revealing response details',async t=>{
  let calls=0;const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',fetchImpl:async()=>{calls++;return{ok:false,status:429,headers:new Headers()};}});
  await assert.rejects(p.get(args()),{code:'discovery_rate_limited'});await assert.rejects(p.get({...args(),offset:1}),{code:'discovery_rate_limited'});assert.equal(calls,1);
});
test('stale fallback is explicit, bounded and only for safe transient failures',async t=>{
  let clock=Date.now(),fail=false;const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',now:()=>clock,sleep:async()=>{},env:{OPPORTUNITY_CACHE_TTL_MS:1000,OPPORTUNITY_MAX_STALE_MS:3000,DISCOVERY_REQUEST_INTERVAL_MS:0},fetchImpl:async()=>fail?{ok:false,status:503}:ok()});
  await p.get(args());fail=true;clock+=2000;assert.equal((await p.get(args())).cache,'stale-fallback');
  clock+=2000;await assert.rejects(p.get(args()),{code:'discovery_upstream_unavailable'});
});
test('retry budget exhaustion cannot become successful empty discovery',async t=>{
  const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',sleep:async()=>{},fetchImpl:async()=>({ok:false,status:503})});
  await assert.rejects(discoverOpportunities({profile:{naics:['541512']},page:a=>p.get(a),config:{...discoveryConfig(),maxRequests:1}}),{code:'discovery_upstream_unavailable'});
});
test('malformed SAM response fails closed',async t=>{
  const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',fetchImpl:async()=>({ok:true,json:async()=>({totalRecords:'100'})})});
  await assert.rejects(p.get(args()),{code:'discovery_invalid_response'});
});
test('identical public queries can share cache while local scores remain profile-specific',async t=>{
  let calls=0;const p=new SamDiscoveryPages({root:await temporary(t),apiKey:'mock',env:{DISCOVERY_REQUEST_INTERVAL_MS:0},fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({totalRecords:1,opportunitiesData:[{noticeId:'same-public-record',title:'Cloud',type:'o',naicsCode:'541512',responseDeadLine:'2099-01-01'}]})};}});
  const discover=capabilities=>discoverOpportunities({profile:{naics:['541512'],capabilities},page:a=>p.get(a),now:new Date('2026-09-20')});
  const a=await discover(['cloud']),b=await discover(['bridge']);
  assert.equal(calls,4);assert.equal(a.summary.strong,1);assert.equal(b.summary.strong,0);assert.equal(b.summary.apiRequests,0);assert.equal(b.summary.cacheHits,4);
});
