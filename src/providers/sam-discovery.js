import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeSamOpportunity} from './sam.js';
import {integer,discoveryError} from '../domain/discovery.js';
const date=value=>`${String(value.getUTCMonth()+1).padStart(2,'0')}/${String(value.getUTCDate()).padStart(2,'0')}/${value.getUTCFullYear()}`;
export function discoveryUrl({query,from,to,limit,offset,apiKey}) {
  const url=new URL('https://api.sam.gov/opportunities/v2/search');
  for(const [k,v] of Object.entries({postedFrom:date(from),postedTo:date(to),limit,offset}))url.searchParams.set(k,String(v));
  for(const key of ['ncode','title','state','typeOfSetAside','rdlfrom','rdlto'])if(query[key])url.searchParams.set(key,query[key]);
  for(const type of query.ptypes||[])url.searchParams.append('ptype',type);
  if(apiKey)url.searchParams.set('api_key',apiKey);
  return url;
}
export class SamDiscoveryPages {
  constructor({root,apiKey,fetchImpl=fetch,env={},now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
    this.root=root;this.apiKey=apiKey;this.fetchImpl=fetchImpl;this.now=now;this.sleep=sleep;this.inflight=new Map();this.queue=Promise.resolve();this.nextRequest=0;this.cooldown=0;
    this.ttl=integer(env.OPPORTUNITY_CACHE_TTL_MS,900000,1000,86400000);this.maxStale=Math.max(this.ttl,integer(env.OPPORTUNITY_MAX_STALE_MS,86400000,1000,604800000));
    this.gap=integer(env.DISCOVERY_REQUEST_INTERVAL_MS,250,0,5000);
  }
  async get(args){
    if(!this.apiKey)throw discoveryError('discovery_not_configured');
    const key=createHash('sha256').update('v1:'+discoveryUrl(args).toString()).digest('hex'),path=join(this.root,key+'.json');
    let cached=null;try{cached=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw discoveryError('discovery_cache_unavailable');}
    const age=cached?this.now()-Date.parse(cached.fetchedAt):Infinity;
    if(cached&&age>=0&&age<=this.ttl)return {...cached,cache:'hit'};
    if(this.inflight.has(key)){const shared=await this.inflight.get(key);return {...shared,cache:shared.cache==='stale-fallback'?'stale-fallback':'shared'};}
    const task=this.queue.then(async()=>{
      try{
        if(this.now()<this.cooldown)throw discoveryError('discovery_rate_limited');
        let response,emptyPage=false;
        for(let attempt=0;attempt<3;attempt++){
          if(args.budget.requests>=args.budget.maxRequests)throw discoveryError(attempt?'discovery_upstream_unavailable':'discovery_request_budget');
          if(args.budget.clock()>=args.budget.deadline)throw discoveryError(attempt?'discovery_upstream_unavailable':'discovery_time_budget');
          const wait=Math.max(0,this.nextRequest-this.now());if(wait)await this.sleep(wait);
          const remaining=args.budget.deadline-args.budget.clock();if(remaining<=0)throw discoveryError(attempt?'discovery_upstream_unavailable':'discovery_time_budget');
          args.budget.requests++;this.nextRequest=this.now()+this.gap;
          let transient=false;
          try{response=await this.fetchImpl(discoveryUrl({...args,apiKey:this.apiKey}),{headers:{'user-agent':'ExcluSignal/RC21 discovery'},signal:AbortSignal.timeout(Math.max(1,Math.min(10000,remaining)))});}
          catch{transient=true;}
          if(response?.status===429){const header=response.headers?.get?.('retry-after');const retry=header?Number(header):NaN;this.cooldown=this.now()+integer(retry*1000,60000,1000,86400000);throw discoveryError('discovery_rate_limited');}
          if(response?.status===404){
            // SAM documents "No Data found" as 404. Recognize only that explicit response,
            // never a generic gateway/endpoint 404 or a vanished continuation page.
            let message='';try{const body=await response.text();try{const parsed=JSON.parse(body);message=typeof parsed==='string'?parsed:parsed.message||parsed.error?.message||parsed.error||'';}catch{message=body;}}catch{}
            if(args.offset===0&&/^no data found\.?$/i.test(String(message).trim())){emptyPage=true;break;}
            throw discoveryError('discovery_upstream_rejected');
          }
          if(response?.ok)break;
          transient ||= [500,502,503,504].includes(response?.status);
          if(!transient)throw discoveryError('discovery_upstream_rejected');
          if(attempt===2)throw discoveryError('discovery_upstream_unavailable');
          await this.sleep(500*2**attempt);response=null;
        }
        let data;try{data=emptyPage?{opportunitiesData:[],totalRecords:0}:await response.json();}catch{throw discoveryError('discovery_invalid_response');}
        if(!Array.isArray(data.opportunitiesData)||!Number.isSafeInteger(data.totalRecords)||data.totalRecords<0||data.opportunitiesData.length>args.limit)throw discoveryError('discovery_invalid_response');
        // Cache only normalized public records, not API response links, keys, or tenant scores.
        const items=data.opportunitiesData.filter(x=>x.noticeId||x.noticeid).map(normalizeSamOpportunity);
        const result={items,rawCount:data.opportunitiesData.length,totalRecords:data.totalRecords,fetchedAt:new Date(this.now()).toISOString()};
        await mkdir(this.root,{recursive:true});const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(result));await rename(tmp,path);
        await this.prune();return {...result,cache:cached?'refresh':'miss'};
      }catch(error){
        const staleAge=cached?this.now()-Date.parse(cached.fetchedAt):Infinity;
        if(cached&&staleAge>=0&&staleAge<=this.maxStale&&['discovery_rate_limited','discovery_upstream_unavailable'].includes(error.code))return {...cached,cache:'stale-fallback'};
        throw error;
      }
    });
    this.queue=task.catch(()=>{});this.inflight.set(key,task);
    try{return await task;}finally{this.inflight.delete(key);}
  }
  async prune(){
    const files=(await readdir(this.root)).filter(f=>/^[a-f0-9]{64}\.json$/.test(f));
    const entries=await Promise.all(files.map(async file=>({file,time:(await stat(join(this.root,file))).mtimeMs})));
    entries.sort((a,b)=>b.time-a.time);for(const entry of entries.slice(256))await rm(join(this.root,entry.file),{force:true});
  }
}
