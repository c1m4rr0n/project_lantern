import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {discoveryError} from '../domain/discovery.js';

export function dailyRequestBudget(value) {
  if(!/^\d+$/.test(String(value??'').trim()))return null;
  const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;
}
export const isSamBudgetError=error=>['discovery_global_budget_exhausted','discovery_budget_reserved','discovery_scheduled_share_exhausted','discovery_budget_unavailable'].includes(error?.code);
const day=now=>new Date(now).toISOString().slice(0,10);
const resetAt=now=>new Date(Date.parse(day(now)+'T00:00:00Z')+86400000).toISOString();
const counter=value=>Number.isSafeInteger(value)&&value>=0;

// One authoritative ledger per application/data root in the supported single-writer process.
// Counts are persisted BEFORE dispatch, so a crash can overcount but cannot refund a sent request.
export class SamRequestBudget {
  constructor({path,limit,now=Date.now,log=entry=>console.log(JSON.stringify(entry))}) {
    this.path=path;this.limit=dailyRequestBudget(limit);this.now=now;this.log=log;
    this.context=new AsyncLocalStorage();this.queue=Promise.resolve();this.state=null;this.leases=new Set();
  }
  run(context,fn){return this.context.run({...this.context.getStore(),...context},fn);}
  current(){return this.context.getStore()||{};}
  async locked(fn){
    const task=this.queue.then(async()=>{
      if(this.failed)throw discoveryError('discovery_budget_unavailable');
      try{
        if(!this.state){
          try{this.state=JSON.parse(await readFile(this.path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;this.state={window:day(this.now()),requests:0,byKind:{},bySource:{}};}
          if(!/^\d{4}-\d{2}-\d{2}$/.test(this.state.window)||!counter(this.state.requests)||!this.state.byKind||!this.state.bySource||![...Object.values(this.state.byKind),...Object.values(this.state.bySource)].every(counter))throw new Error('invalid ledger');
        }
        if(this.state.window<day(this.now())){this.state={window:day(this.now()),requests:0,byKind:{},bySource:{}};this.leases.clear();}
        // A backward clock must not reopen an earlier budget window.
        if(this.state.window>day(this.now()))throw new Error('clock moved backwards');
      }catch{this.failed=true;throw discoveryError('discovery_budget_unavailable');}
      return fn();
    });
    this.queue=task.catch(()=>{});return task;
  }
  available(){return this.limit===null?null:Math.max(0,this.limit-this.state.requests-[...this.leases].reduce((n,l)=>n+l.remaining,0));}
  async status(){return this.locked(()=>({window:this.state.window,limit:this.limit,requests:this.state.requests,remaining:this.limit===null?null:Math.max(0,this.limit-this.state.requests),unreserved:this.available(),resetAt:resetAt(this.now()),byKind:{...this.state.byKind},bySource:{...this.state.bySource}}));}
  async reserveScheduled(tenantIds){
    return this.locked(()=>{
      const ids=[...new Set(tenantIds)].sort(),leases=new Map();if(!ids.length)return leases;
      // Rotate who receives indivisible remainder slots each UTC day; input/account order has no privilege.
      const offset=Math.floor(this.now()/86400000)%ids.length,order=[...ids.slice(offset),...ids.slice(0,offset)];
      const available=this.available();
      for(let i=0;i<order.length;i++){
        if(available===null){leases.set(order[i],null);continue;}
        const lease={window:this.state.window,remaining:Math.floor(available/order.length)+(i<available%order.length?1:0)};
        this.leases.add(lease);leases.set(order[i],lease);
      }
      return leases;
    });
  }
  async release(lease){if(lease)await this.locked(()=>this.leases.delete(lease));}
  async consume(kind){
    return this.locked(async()=>{
      const {lease,source='manual'}=this.current();
      const deny=code=>{const error=discoveryError(code);error.retryAt=code==='discovery_budget_reserved'?new Date(this.now()+60000).toISOString():resetAt(this.now());this.log({event:'sam.upstream.deferred',code,retryAt:error.retryAt});throw error;};
      if(this.limit!==null){
        if(this.state.requests>=this.limit)deny('discovery_global_budget_exhausted');
        if(lease){if(!this.leases.has(lease)||lease.window!==this.state.window||lease.remaining<=0)deny('discovery_scheduled_share_exhausted');}
        else if(this.available()<=0)deny('discovery_budget_reserved');
      }
      const safeKind=['discovery','tracked-notice','description','exclusions'].includes(kind)?kind:'other';
      const safeSource=['manual','scheduler','operations'].includes(source)?source:'manual';
      this.state.requests++;this.state.byKind[safeKind]=(this.state.byKind[safeKind]||0)+1;this.state.bySource[safeSource]=(this.state.bySource[safeSource]||0)+1;
      if(lease)lease.remaining--;
      try{
        await mkdir(dirname(this.path),{recursive:true});const tmp=this.path+'.'+randomUUID()+'.tmp';
        await writeFile(tmp,JSON.stringify(this.state),{mode:0o600});await rename(tmp,this.path);
      }catch{this.failed=true;throw discoveryError('discovery_budget_unavailable');}
      this.log({event:'sam.upstream.request',kind:safeKind,source:safeSource,window:this.state.window,requests:this.state.requests,budgetConfigured:this.limit!==null});
    });
  }
  wrap(fetchImpl,kind){return async(url,options={})=>{
    // Only actual SAM API dispatches count; downstream files on other hosts are not SAM API calls.
    let target=new URL(url instanceof Request?url.url:url),requestOptions={...options,redirect:'manual'};
    for(let hop=0;hop<6;hop++){
      if(['api.sam.gov','api-alpha.sam.gov'].includes(target.hostname))await this.consume(kind);
      const response=await fetchImpl(target,requestOptions);
      if(![301,302,303,307,308].includes(response.status)||options.redirect==='manual')return response;
      if(options.redirect==='error')throw new Error('SAM redirect rejected');
      const location=response.headers?.get('location');if(!location)return response;
      const next=new URL(location,target);if(next.protocol!=='https:')throw new Error('SAM insecure redirect rejected');
      if(next.origin!==target.origin){const headers=new Headers(requestOptions.headers);headers.delete('authorization');headers.delete('cookie');requestOptions={...requestOptions,headers};}
      target=next;
    }
    throw new Error('SAM redirect limit reached');
  };}
}
