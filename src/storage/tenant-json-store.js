import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SAFE_TENANT = /^[a-zA-Z0-9-]{8,80}$/;

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
}

async function atomicJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, path);
}

export class TenantJsonStore {
  constructor({ root, tenantId, seedProfile = null, seedOpportunities = [] }) {
    if (!SAFE_TENANT.test(String(tenantId))) throw new Error('invalid tenant id');
    this.root = resolve(root);
    this.tenantId = String(tenantId);
    this.dir = join(this.root, this.tenantId);
    this.profilePath = join(this.dir, 'profile.json');
    this.opportunitiesPath = join(this.dir, 'opportunities.json');
    this.decisionsPath = join(this.dir, 'decisions.json');
    this.changesPath = join(this.dir, 'opportunity-changes.json');
    this.vendorsPath = join(this.dir, 'vendors.json');
    this.vendorScreeningsPath = join(this.dir, 'vendor-screenings.json');
    this.billingPath = join(this.dir, 'billing.json');
    this.seedProfile = seedProfile;
    this.seedOpportunities = seedOpportunities;
  }
  async getProfile() { return readJson(this.profilePath, this.seedProfile || { name:'', naics:[], capabilities:[], setAsides:[], regions:[], negativeKeywords:[], hardBlockers:[] }); }
  async saveProfile(profile) { await atomicJson(this.profilePath, profile); return profile; }
  async getOpportunities() { return readJson(this.opportunitiesPath, this.seedOpportunities); }
  async saveOpportunities(items) { await atomicJson(this.opportunitiesPath, items); return items; }
  async findOpportunity(id) { return (await this.getOpportunities()).find(x => String(x.id) === String(id)) || null; }
  async replaceOpportunity(item) {
    const items = await this.getOpportunities();
    const index = items.findIndex(x => String(x.id) === String(item.id));
    if (index < 0) throw new Error('opportunity not found');
    items[index] = item;
    await this.saveOpportunities(items);
    return item;
  }
  async getDecisions() { return readJson(this.decisionsPath, {}); }
  async saveDecision(opportunityId, decision) { const all=await this.getDecisions(); all[String(opportunityId)] = decision; await atomicJson(this.decisionsPath, all); return decision; }
  async getOpportunityChanges(opportunityId = null) { const all=await readJson(this.changesPath, {}); return opportunityId == null ? all : (all[String(opportunityId)] || []); }
  async appendOpportunityChange(opportunityId, event, { limit = 50 } = {}) {
    const all=await this.getOpportunityChanges(); const key=String(opportunityId); const history=Array.isArray(all[key])?all[key]:[];
    if(history.some(x=>x.id===event.id)) return event;
    history.push(event); all[key]=history.slice(-Math.max(1,Number(limit)||50)); await atomicJson(this.changesPath,all); return event;
  }
  async acknowledgeOpportunityChanges(opportunityId, { now = new Date() } = {}) {
    const all=await this.getOpportunityChanges(); const key=String(opportunityId); const history=Array.isArray(all[key])?all[key]:[]; const acknowledgedAt=now.toISOString(); let changed=0;
    all[key]=history.map(event=>{if(event.acknowledgedAt)return event; changed++; return {...event,acknowledgedAt};});
    await atomicJson(this.changesPath,all); return {acknowledged:changed,acknowledgedAt};
  }
  async getVendors() { return readJson(this.vendorsPath, []); }
  async saveVendors(vendors) { await atomicJson(this.vendorsPath, vendors); return vendors; }
  async getBilling() { return readJson(this.billingPath, null); }
  async saveBilling(state) { await atomicJson(this.billingPath, state); return state; }
  async getVendorScreenings(vendorId = null) { const all=await readJson(this.vendorScreeningsPath,{}); return vendorId==null?all:(all[String(vendorId)]||[]); }
  async appendVendorScreening(vendorId,screening,{limit=730}={}) {
    const all=await this.getVendorScreenings(); const key=String(vendorId); const history=Array.isArray(all[key])?all[key]:[];
    if(history.some(x=>x.id===screening.id))return screening;
    history.push(screening); all[key]=history.slice(-Math.max(1,Number(limit)||730)); await atomicJson(this.vendorScreeningsPath,all); return screening;
  }
  async acknowledgeVendorScreenings(vendorId,{now=new Date()}={}) {
    const all=await this.getVendorScreenings(); const key=String(vendorId); const history=Array.isArray(all[key])?all[key]:[]; const acknowledgedAt=now.toISOString(); let changed=0;
    all[key]=history.map(event=>{if(!event.alert||event.acknowledgedAt)return event;changed++;return{...event,acknowledgedAt};});
    await atomicJson(this.vendorScreeningsPath,all); return {acknowledged:changed,acknowledgedAt};
  }
}
