import { createHash } from 'node:crypto';
import { scoreOpportunity } from '../domain/scoring.js';
import { extractRequirements } from '../domain/requirements.js';
import { detectMaterialChanges, detectFitImpact } from '../domain/change-detection.js';
import { detectRequirementDelta } from '../domain/requirement-delta.js';
import {planDiscovery,profileFingerprint,discoveryError} from '../domain/discovery.js';
import {isSamBudgetError} from '../ops/sam-request-budget.js';

const syncing=new Map();

function normalizeRequirementText(value='') { return String(value).trim().toLowerCase().replace(/\s+/g,' '); }
function isMachineRequirement(item={}) {
  return item.origin === 'sam-extracted' || String(item.source || '').startsWith('SAM.gov description');
}

function mergeRequirements(existing = [], extracted = []) {
  const seen = new Set();
  const out = [];
  for (const item of [...existing, ...extracted]) {
    const key = normalizeRequirementText(item?.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function reconcileRequirements(existing = [], extracted = []) {
  const previous = new Map(existing.map(item => [normalizeRequirementText(item?.text), item]));
  const manual = existing.filter(item => !isMachineRequirement(item));
  const machine = extracted.map(item => {
    const prior = previous.get(normalizeRequirementText(item.text));
    return prior ? { ...item, status:prior.status || item.status, id:prior.id || item.id } : item;
  });
  return mergeRequirements(manual, machine);
}

function baselineRequirements(item = {}) {
  if (Array.isArray(item.requirementSnapshot)) return item.requirementSnapshot;
  const machine = (item.requirements || []).filter(isMachineRequirement);
  if (machine.length) return machine;
  if (item.description && item.enrichedAt) return extractRequirements(item.description, { source:`SAM.gov description · ${item.id}` });
  return [];
}

function hasRequirementBaseline(item = {}) {
  return Array.isArray(item.requirementSnapshot) || Boolean(item.enrichedAt) || (item.requirements || []).some(isMachineRequirement);
}

function mergeSyncedOpportunity(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    description: incoming.description || existing.description || '',
    requirements: mergeRequirements(existing.requirements || [], incoming.requirements || []),
    requirementSnapshot: existing.requirementSnapshot || incoming.requirementSnapshot || null,
    requirementCheckedAt: existing.requirementCheckedAt || incoming.requirementCheckedAt || null,
    enrichedAt: existing.enrichedAt || incoming.enrichedAt || null,
    enrichment: existing.enrichment || incoming.enrichment || null
  };
}

function tracked(decision) { return ['reviewing','pursue'].includes(decision?.status); }
export function isDemoSeedOpportunity(item = {}) {
  return String(item.id || '').startsWith('mock-')
    || String(item.solicitationNumber || '').startsWith('DEMO-')
    || String(item.agency || '').startsWith('DEMO ');
}
function changeSummary(history = []) {
  const unread = history.filter(x => !x.acknowledgedAt);
  const latest = history.at(-1) || null;
  return {
    totalCount:history.length,
    unreadCount:unread.length,
    latestDetectedAt:latest?.detectedAt || null,
    latest:latest ? {
      id:latest.id,
      detectedAt:latest.detectedAt,
      acknowledgedAt:latest.acknowledgedAt || null,
      changes:latest.changes || [],
      impact:latest.impact || null,
      requirementDelta:latest.requirementDelta || null,
      requirementAnalysis:latest.requirementAnalysis || null
    } : null
  };
}

function requirementOnlyEvent(opportunityId, delta, detectedAt) {
  const id=createHash('sha256')
    .update(`${opportunityId}:requirements:${delta.beforeFingerprint}:${delta.afterFingerprint}`)
    .digest('hex')
    .slice(0,24);
  return {
    id,
    opportunityId:String(opportunityId),
    detectedAt,
    beforeFingerprint:delta.beforeFingerprint,
    afterFingerprint:delta.afterFingerprint,
    changes:[],
    requirementDelta:delta,
    acknowledgedAt:null
  };
}

export class OpportunityService {
  constructor({ store, provider, detailProvider = null, watchProvider = null, excludeDemoSeed = false, now=Date.now }) {
    this.store = store;
    this.provider = provider;
    this.detailProvider = detailProvider;
    this.watchProvider = watchProvider;
    this.excludeDemoSeed = Boolean(excludeDemoSeed);
    this.now=now;
  }
  async list() {
    const [profile, items, decisions, changes] = await Promise.all([
      this.store.getProfile(),
      this.store.getOpportunities(),
      this.store.getDecisions ? this.store.getDecisions() : {},
      this.store.getOpportunityChanges ? this.store.getOpportunityChanges() : {}
    ]);
    const visibleItems = this.excludeDemoSeed ? items.filter(item => !isDemoSeedOpportunity(item)) : items;
    return visibleItems
      .map(item => {
        const history = changes[item.id] || [];
        return { ...item, decision: decisions[item.id] || { status:'new', note:'', updatedAt:null }, changeWatch:changeSummary(history), match: scoreOpportunity(profile, item) };
      })
      .sort((a, b) => b.match.score - a.match.score);
  }
  async get(id) {
    const items = await this.list();
    return items.find(x => String(x.id) === String(id)) || null;
  }

  async #refreshRequirements({ prior, current, profile, metadataEvent, syncedAt }) {
    if (!this.detailProvider || !current?.descriptionUrl) return { item:current, event:metadataEvent, checked:false, requirementChanged:false };
    try {
      const detail=await this.detailProvider.get({
        id:current.id,
        descriptionUrl:current.descriptionUrl,
        forceRefresh:Boolean(metadataEvent)
      });
      const extracted=extractRequirements(detail.description, { source:`SAM.gov description · ${current.id}` });
      const hadBaseline=hasRequirementBaseline(prior);
      const before=baselineRequirements(prior);
      const delta=hadBaseline ? detectRequirementDelta(before,extracted,{profile}) : null;
      const item={
        ...current,
        description:detail.description,
        requirements:reconcileRequirements(prior.requirements || current.requirements || [],extracted),
        requirementSnapshot:extracted,
        requirementCheckedAt:syncedAt,
        enrichedAt:current.enrichedAt || syncedAt,
        enrichment:{source:'sam.gov',cache:detail.cache,fetchedAt:detail.fetchedAt,stale:detail.cache==='stale-fallback'}
      };
      let event=metadataEvent;
      if(delta?.changed){
        if(event) event={...event,requirementDelta:delta};
        else event=requirementOnlyEvent(current.id,delta,syncedAt);
      }
      if(event) event={...event,requirementAnalysis:{status:'ok',cache:detail.cache,fetchedAt:detail.fetchedAt}};
      return { item, event, checked:true, requirementChanged:Boolean(delta?.changed) };
    } catch(error) {
      if(isSamBudgetError(error))throw error;
      const event=metadataEvent ? {...metadataEvent,requirementAnalysis:{status:'error',error:String(error.message || error).slice(0,300)}} : null;
      return { item:current, event, checked:true, requirementChanged:false, error:String(error.message || error) };
    }
  }

  async #processTrackedChange({ prior, current, profile, syncedAt }) {
    let event=detectMaterialChanges(prior,current,{detectedAt:syncedAt});
    const refreshed=await this.#refreshRequirements({prior,current,profile,metadataEvent:event,syncedAt});
    event=refreshed.event;
    if(event) event={...event,impact:detectFitImpact(profile,prior,refreshed.item,{at:syncedAt})};
    return {...refreshed,event};
  }

  async sync({source='manual'}={}) {
    const key=this.store.dir || (this.store.db ? this.store.db : this.store);
    let tenants=syncing.get(key);if(!tenants){tenants=new Map();syncing.set(key,tenants);}
    const tenant=this.store.tenantId||'local';
    if(tenants.has(tenant))return tenants.get(tenant);
    const work=()=>this.#sync({source}).catch(async error=>{
      if(isSamBudgetError(error)){error.retryAt ||= new Date(this.now()+60000).toISOString();const saved=await this.store.getDiscovery?.();await this.store.saveDiscovery?.({...saved,refreshUnavailable:{code:error.code,retryAt:error.retryAt}});}
      throw error;
    });
    const promise=this.provider.withRequestContext?this.provider.withRequestContext({source},work):work();tenants.set(tenant,promise);
    try{return await promise;}finally{tenants.delete(tenant);if(!tenants.size)syncing.delete(key);}
  }
  async discoveryStatus() {
    const profile=await this.store.getProfile(),plan=planDiscovery(profile);
    const saved=await this.store.getDiscovery?.();
    const {fresh,freshUntil}=this.#freshness(saved,profile);
    let unavailable=!fresh&&saved?.refreshUnavailable&&(saved.refreshUnavailable.retryAt===null||Date.parse(saved.refreshUnavailable.retryAt)>this.now())?saved.refreshUnavailable:null;
    if(this.provider.budget)try{
      const budget=await this.provider.budget.status();
      if(!fresh&&budget.limit!==null&&budget.unreserved===0)unavailable=budget.remaining===0?{code:'discovery_global_budget_exhausted',retryAt:budget.resetAt}:{code:'discovery_budget_reserved',retryAt:new Date(this.now()+60000).toISOString()};
    }catch(error){if(!isSamBudgetError(error))throw error;unavailable={code:error.code,retryAt:null};}
    return {configured:plan.configured,mode:plan.mode,summary:saved?.summary||null,profileChanged:Boolean(saved?.summary&&saved.profileFingerprint!==profileFingerprint(profile)),fresh,freshUntil,refreshUnavailable:unavailable};
  }
  #freshness(saved,profile){
    const searched=Date.parse(saved?.summary?.syncedAt),ttl=this.provider.freshnessMs||0;
    const fresh=ttl>0&&saved?.profileFingerprint===profileFingerprint(profile)&&this.now()>=searched&&this.now()<searched+ttl;
    return {fresh:Boolean(fresh),freshUntil:Number.isFinite(searched)&&ttl>0?new Date(searched+ttl).toISOString():null};
  }
  async #sync({source}) {
    const syncedAt = new Date().toISOString();
    const profile=await this.store.getProfile();
    if(!planDiscovery(profile).configured)throw discoveryError('discovery_profile_required',409);
    const saved=await this.store.getDiscovery?.();
    if(source==='manual'&&this.#freshness(saved,profile).fresh)return {count:(await this.store.getOpportunities()).length,syncedAt:saved.summary.syncedAt,discovery:saved.summary,reused:true};
    if(this.provider.budget){const budget=await this.provider.budget.status();if(budget.limit!==null&&budget.remaining===0){const error=discoveryError('discovery_global_budget_exhausted');error.retryAt=budget.resetAt;throw error;}}
    if(saved?.refreshUnavailable&&(saved.refreshUnavailable.retryAt===null||Date.parse(saved.refreshUnavailable.retryAt)>this.now())){
      const error=discoveryError(saved.refreshUnavailable.code);error.retryAt=saved.refreshUnavailable.retryAt;throw error;
    }
    const discovery=this.provider.discover?await this.provider.discover(profile):null;
    const incoming=discovery?discovery.items:await this.provider(profile);
    if(profileFingerprint(profile)!==profileFingerprint(await this.store.getProfile()))throw discoveryError('discovery_profile_changed',409);
    const [existing, decisions] = await Promise.all([
      this.store.getOpportunities(),
      this.store.getDecisions ? this.store.getDecisions() : {}
    ]);
    const cleanExisting = this.excludeDemoSeed ? existing.filter(item => !isDemoSeedOpportunity(item)) : existing;
    const byId = new Map(cleanExisting.map(item => [String(item.id), item]));
    const seen = new Set();
    const items = [];
    const pendingChanges=[];
    let materialChanges = 0;
    let requirementChanges = 0;
    let requirementChecks = 0;
    let watchRefreshes = 0;
    let trackedRetained = 0;

    for (const item of incoming) {
      const id=String(item.id);
      if(seen.has(id))continue;
      seen.add(id);
      const prior=byId.get(id);
      const decision=decisions[id] || {status:'new'};
      let current={ ...mergeSyncedOpportunity(prior,item), lastSeenAt:syncedAt, feedStatus:'current' };
      if (prior && tracked(decision) && this.store.appendOpportunityChange) {
        const result=await this.#processTrackedChange({prior,current,profile,syncedAt});
        current=result.item;
        if(result.checked) requirementChecks++;
        if(result.requirementChanged) requirementChanges++;
        if(result.event){ pendingChanges.push([id,result.event]); materialChanges++; }
      }
      items.push(current);
    }

    for (const prior of cleanExisting) {
      const id=String(prior.id);
      if (seen.has(id)) continue;
      const decision=decisions[id] || {status:'new'};
      if (!tracked(decision)) continue;
      trackedRetained++;
      let refreshed=null;
      let watchMeta=null;
      if (this.watchProvider?.get) {
        try {
          const result=await this.watchProvider.get({id,postedDate:prior.postedDate || null});
          watchRefreshes++;
          refreshed=result?.item || null;
          watchMeta={cache:result?.cache || 'unknown',fetchedAt:result?.fetchedAt || null,stale:result?.cache==='stale-fallback'};
        } catch (error) {
          if(isSamBudgetError(error))throw error;
          watchMeta={error:String(error.message || error).slice(0,300)};
        }
      }
      if (refreshed) {
        let current={ ...mergeSyncedOpportunity(prior,refreshed), lastSeenAt:syncedAt, feedStatus:'tracked-refresh', watchMeta };
        if (this.store.appendOpportunityChange) {
          const result=await this.#processTrackedChange({prior,current,profile,syncedAt});
          current=result.item;
          if(result.checked) requirementChecks++;
          if(result.requirementChanged) requirementChanges++;
          if(result.event){ pendingChanges.push([id,result.event]); materialChanges++; }
        }
        items.push(current);
      } else {
        items.push({ ...prior, feedStatus:'tracked-retained', watchMeta });
      }
    }

    // Decisions may change while remote detail requests are in flight. Never prune a newly tracked record.
    const latestDecisions=await this.store.getDecisions?.()||decisions;
    const retainedIds=new Set(items.map(x=>String(x.id)));
    for(const prior of await this.store.getOpportunities())if(!retainedIds.has(String(prior.id))&&tracked(latestDecisions[prior.id]))items.push({...prior,feedStatus:'tracked-retained'});
    for(const [id,event] of pendingChanges)await this.store.appendOpportunityChange(id,event);
    await this.store.saveOpportunities(items);
    if(discovery){discovery.summary.retained=items.length;discovery.summary.syncedAt=new Date(this.now()).toISOString();await this.store.saveDiscovery?.({summary:discovery.summary,profileFingerprint:profileFingerprint(profile)});}
    return { count:items.length, syncedAt, materialChanges, requirementChanges, requirementChecks, watchRefreshes, trackedRetained, ...(discovery?{discovery:discovery.summary}:{}) };
  }
  async enrich(id) {
    const current = await this.store.findOpportunity(id);
    if (!current) return null;
    if (!current.descriptionUrl) {
      const extracted = current.description ? extractRequirements(current.description, { source:`SAM.gov description · ${current.id}` }) : [];
      const requirements = reconcileRequirements(current.requirements || [], extracted);
      const saved = { ...current, requirements, requirementSnapshot:extracted, requirementCheckedAt:new Date().toISOString(), enrichedAt:new Date().toISOString(), enrichment:{ source:'embedded-description', cache:'n/a' } };
      await this.store.replaceOpportunity(saved);
      return this.get(id);
    }
    if (!this.detailProvider) throw new Error('opportunity enrichment is not configured');
    const detail = await this.detailProvider.get({ id:current.id, descriptionUrl:current.descriptionUrl, forceRefresh:true });
    const extracted=extractRequirements(detail.description, { source:`SAM.gov description · ${current.id}` });
    const requirements = reconcileRequirements(current.requirements || [], extracted);
    const now=new Date().toISOString();
    const saved = {
      ...current,
      description: detail.description,
      requirements,
      requirementSnapshot:extracted,
      requirementCheckedAt:now,
      enrichedAt: now,
      enrichment: { source:'sam.gov', cache:detail.cache, fetchedAt:detail.fetchedAt, stale:detail.cache === 'stale-fallback' }
    };
    await this.store.replaceOpportunity(saved);
    return this.get(id);
  }
  async changes(id) {
    return this.store.getOpportunityChanges ? this.store.getOpportunityChanges(id) : [];
  }
  async acknowledgeChanges(id) {
    if (!this.store.acknowledgeOpportunityChanges) return {acknowledged:0,acknowledgedAt:null};
    return this.store.acknowledgeOpportunityChanges(id);
  }
}
