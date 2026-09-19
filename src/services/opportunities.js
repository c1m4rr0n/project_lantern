import { createHash } from 'node:crypto';
import { scoreOpportunity } from '../domain/scoring.js';
import { extractRequirements } from '../domain/requirements.js';
import { detectMaterialChanges, detectFitImpact } from '../domain/change-detection.js';
import { detectRequirementDelta } from '../domain/requirement-delta.js';

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
  constructor({ store, provider, detailProvider = null, watchProvider = null, excludeDemoSeed = false }) {
    this.store = store;
    this.provider = provider;
    this.detailProvider = detailProvider;
    this.watchProvider = watchProvider;
    this.excludeDemoSeed = Boolean(excludeDemoSeed);
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

  async sync() {
    const syncedAt = new Date().toISOString();
    const [incoming, existing, decisions, profile] = await Promise.all([
      this.provider(),
      this.store.getOpportunities(),
      this.store.getDecisions ? this.store.getDecisions() : {},
      this.store.getProfile()
    ]);
    const cleanExisting = this.excludeDemoSeed ? existing.filter(item => !isDemoSeedOpportunity(item)) : existing;
    const byId = new Map(cleanExisting.map(item => [String(item.id), item]));
    const seen = new Set();
    const items = [];
    let materialChanges = 0;
    let requirementChanges = 0;
    let requirementChecks = 0;
    let watchRefreshes = 0;
    let trackedRetained = 0;

    for (const item of incoming) {
      const id=String(item.id);
      seen.add(id);
      const prior=byId.get(id);
      const decision=decisions[id] || {status:'new'};
      let current={ ...mergeSyncedOpportunity(prior,item), lastSeenAt:syncedAt, feedStatus:'current' };
      if (prior && tracked(decision) && this.store.appendOpportunityChange) {
        const result=await this.#processTrackedChange({prior,current,profile,syncedAt});
        current=result.item;
        if(result.checked) requirementChecks++;
        if(result.requirementChanged) requirementChanges++;
        if(result.event){ await this.store.appendOpportunityChange(id,result.event); materialChanges++; }
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
          if(result.event){ await this.store.appendOpportunityChange(id,result.event); materialChanges++; }
        }
        items.push(current);
      } else {
        items.push({ ...prior, feedStatus:'tracked-retained', watchMeta });
      }
    }

    await this.store.saveOpportunities(items);
    return { count:items.length, syncedAt, materialChanges, requirementChanges, requirementChecks, watchRefreshes, trackedRetained };
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
