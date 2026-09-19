import { createHash, randomUUID } from 'node:crypto';
import { normalizeIdentifier, normalizeLegalName } from '../providers/sam-exclusions.js';
import { audit, withTenantLock } from '../security/events.js';
import { findDuplicate, previewImport } from './vendor-import.js';

const nowIso = now => (now instanceof Date ? now : new Date(now)).toISOString();
const clean = value => String(value ?? '').trim();

export function validateVendor(input, existing = null) {
  const legalName = clean(input?.legalName ?? input?.name ?? existing?.legalName);
  const uei = normalizeIdentifier(input?.uei ?? existing?.uei);
  const cage = normalizeIdentifier(input?.cage ?? existing?.cage);
  const notes = clean(input?.notes ?? existing?.notes).slice(0,1000);
  if (!legalName && !uei && !cage) throw new Error('legal name, UEI, or CAGE is required');
  if (uei && (uei.length < 5 || uei.length > 12)) throw new Error('UEI must be 5-12 alphanumeric characters');
  if (cage && cage.length !== 5) throw new Error('CAGE must be 5 alphanumeric characters');
  return { legalName, uei, cage, notes };
}

function screeningFingerprint(screening) {
  const matches=(screening.matches||[]).map(x=>({samNumber:x.samNumber||'',uei:normalizeIdentifier(x.uei),cage:normalizeIdentifier(x.cage),type:x.exclusionType||'',agency:x.excludingAgency||'',termination:x.terminationDate||''}));
  return createHash('sha256').update(JSON.stringify({status:screening.status,matchType:screening.matchType||'',matches})).digest('hex');
}

function vendorPublic(vendor, history=[]) {
  const unread=history.filter(x=>x.alert && !x.acknowledgedAt).length;
  return { ...vendor, watch:{ unreadCount:unread, totalScreenings:history.length, latest:history.at(-1)||vendor.latestScreening||null } };
}

export class VendorWatchService {
  constructor({ store, exclusionProvider }) {
    this.store=store;
    this.exclusionProvider=exclusionProvider;
    for(const name of ['add','update','archive','restore','importCsv','screenOne','screenAll','acknowledge']) {
      const method=this[name].bind(this);
      this[name]=(...args)=>withTenantLock(`vendors:${store.tenantId}`,()=>method(...args));
    }
  }

  async list({archived=false,all=false}={}) {
    const vendors=await this.store.getVendors();
    const history=await this.store.getVendorScreenings();
    return vendors.filter(v=>all || Boolean(v.archivedAt)===archived).map(v=>vendorPublic(v,history[String(v.id)]||[]));
  }

  async get(id) {
    const vendor=(await this.store.getVendors()).find(v=>String(v.id)===String(id));
    if(!vendor)return null;
    return vendorPublic(vendor,await this.store.getVendorScreenings(id));
  }

  async add(input,{now=new Date(),capacity=null}={}) {
    const validated=validateVendor(input);
    const vendor={id:randomUUID(),...validated,normalizedName:normalizeLegalName(validated.legalName),createdAt:nowIso(now),updatedAt:nowIso(now),latestScreening:null};
    const vendors=await this.store.getVendors();
    if(capacity)await capacity(vendors.filter(v=>!v.archivedAt).length);
    const duplicate=vendors.find(v=>(vendor.uei&&v.uei===vendor.uei)||(vendor.cage&&v.cage===vendor.cage)||(!vendor.uei&&!vendor.cage&&vendor.normalizedName&&v.normalizedName===vendor.normalizedName));
    if(duplicate)throw new Error('vendor already exists');
    vendors.push(vendor);await this.store.saveVendors(vendors);return vendor;
  }

  async update(id,input,{now=new Date()}={}) {
    const vendors=await this.store.getVendors();
    const index=vendors.findIndex(v=>String(v.id)===String(id));
    if(index<0)return null;
    const validated=validateVendor(input,vendors[index]);
    if(findDuplicate({...validated,normalizedName:normalizeLegalName(validated.legalName)},vendors.filter((_,i)=>i!==index)))throw new Error('vendor already exists');
    vendors[index]={...vendors[index],...validated,normalizedName:normalizeLegalName(validated.legalName),updatedAt:nowIso(now)};
    await this.store.saveVendors(vendors);return vendors[index];
  }

  async remove(id) { return this.archive(id); }

  async archive(id) {
    const vendors=await this.store.getVendors();
    const vendor=vendors.find(v=>String(v.id)===String(id));
    if(!vendor)return false;
    if(!vendor.archivedAt){vendor.archivedAt=new Date().toISOString();await this.store.saveVendors(vendors);await audit(this.store,'vendor.archived',{subjectId:vendor.id});}
    return true;
  }

  async restore(id,{capacity=null}={}) {
    const vendors=await this.store.getVendors();const vendor=vendors.find(v=>String(v.id)===String(id));
    if(!vendor)return null;
    if(vendor.archivedAt){if(capacity)await capacity(vendors.filter(v=>!v.archivedAt).length);vendor.archivedAt=null;await this.store.saveVendors(vendors);await audit(this.store,'vendor.restored',{subjectId:vendor.id});}
    return vendor;
  }

  async previewCsv(text) {return previewImport(text,await this.store.getVendors(),validateVendor,normalizeLegalName);}

  async importCsv({text,fingerprint,confirmed,rows},{capacity}={}) {
    if(confirmed!==true)throw new Error('Explicit confirmation required');
    const vendors=await this.store.getVendors();const preview=previewImport(text,vendors,validateVendor,normalizeLegalName);
    if(preview.fingerprint!==fingerprint){const error=new Error('Watchlist changed; preview again');error.status=409;throw error;}
    if(!Array.isArray(rows)||!rows.length||new Set(rows).size!==rows.length)throw new Error('Select valid rows');
    const selected=rows.map(n=>preview.rows.find(r=>r.row===n&&r.status==='valid'));
    if(selected.some(x=>!x))throw new Error('Only valid preview rows can be imported');
    if(!capacity)throw new Error('Import capacity check required');
    await capacity(vendors.filter(v=>!v.archivedAt).length+selected.length-1);
    const now=new Date().toISOString();
    const added=selected.map(r=>({id:randomUUID(),...r.value,createdAt:now,updatedAt:now,archivedAt:null,latestScreening:null}));
    await this.store.saveVendors([...vendors,...added]);await audit(this.store,'vendor.imported');
    return {imported:added.length,items:added};
  }

  async history(id){return this.store.getVendorScreenings(id);}
  async acknowledge(id,options){return this.store.acknowledgeVendorScreenings(id,options);}

  async screenOne(id,{now=new Date(),snapshot=null,force=false}={}) {
    if(!this.exclusionProvider)throw new Error('vendor screening provider is not configured');
    const vendors=await this.store.getVendors();
    const index=vendors.findIndex(v=>String(v.id)===String(id));
    if(index<0)return null;
    const vendor=vendors[index];
    if(vendor.archivedAt)throw new Error('Restore archived vendor before screening');
    const effectiveSnapshot=snapshot || (this.exclusionProvider.getSnapshot ? await this.exclusionProvider.getSnapshot({force}) : null);
    const result=effectiveSnapshot && this.exclusionProvider.screenAgainstSnapshot
      ? await Promise.resolve(this.exclusionProvider.screenAgainstSnapshot(vendor,effectiveSnapshot))
      : null;
    const screened=result || await this.exclusionProvider.screen(vendor,{force});
    const history=await this.store.getVendorScreenings(id);
    const previous=history.at(-1)||vendor.latestScreening||null;
    const fingerprint=screeningFingerprint(screened);
    const changed=Boolean(previous&&previous.fingerprint!==fingerprint);
    const initialRisk=!previous&&['excluded','possible-match'].includes(screened.status);
    const alert=changed||initialRisk;
    const entry={
      id:randomUUID(),vendorId:vendor.id,screenedAt:nowIso(now),status:screened.status,matchType:screened.matchType||null,confidence:screened.confidence||null,reason:screened.reason||'',matches:screened.matches||[],source:screened.source||null,fingerprint,previousStatus:previous?.status||null,changed,alert,acknowledgedAt:alert?null:nowIso(now)
    };
    await this.store.appendVendorScreening(vendor.id,entry);
    vendors[index]={...vendor,latestScreening:entry,updatedAt:vendor.updatedAt||nowIso(now)};
    await this.store.saveVendors(vendors);
    return vendorPublic(vendors[index],await this.store.getVendorScreenings(id));
  }

  async screenAll({now=new Date(),force=false,snapshot=null}={}) {
    if(!this.exclusionProvider)throw new Error('vendor screening provider is not configured');
    const vendors=await this.store.getVendors();
    if(!vendors.some(v=>!v.archivedAt))return {screened:0,excluded:0,possibleMatches:0,changed:0,alerts:0,source:null,items:[]};
    snapshot=snapshot||await this.exclusionProvider.getSnapshot({force});
    const items=[];
    for(let i=0;i<vendors.length;i++){
      const vendor=vendors[i];
      if(vendor.archivedAt)continue;
      const screened=this.exclusionProvider.screenAgainstSnapshot
        ? this.exclusionProvider.screenAgainstSnapshot(vendor,snapshot)
        : await this.exclusionProvider.screen(vendor,{force:false});
      const history=await this.store.getVendorScreenings(vendor.id);
      const previous=history.at(-1)||vendor.latestScreening||null;
      const fingerprint=screeningFingerprint(screened);
      const changed=Boolean(previous&&previous.fingerprint!==fingerprint);
      const initialRisk=!previous&&['excluded','possible-match'].includes(screened.status);
      const alert=changed||initialRisk;
      const entry={id:randomUUID(),vendorId:vendor.id,screenedAt:nowIso(now),status:screened.status,matchType:screened.matchType||null,confidence:screened.confidence||null,reason:screened.reason||'',matches:screened.matches||[],source:screened.source||null,fingerprint,previousStatus:previous?.status||null,changed,alert,acknowledgedAt:alert?null:nowIso(now)};
      await this.store.appendVendorScreening(vendor.id,entry);
      vendors[i]={...vendor,latestScreening:entry};
      items.push({...entry,legalName:vendor.legalName,uei:vendor.uei,cage:vendor.cage});
    }
    await this.store.saveVendors(vendors);
    return {
      screened:items.length,
      excluded:items.filter(x=>x.status==='excluded').length,
      possibleMatches:items.filter(x=>x.status==='possible-match').length,
      changed:items.filter(x=>x.changed).length,
      alerts:items.filter(x=>x.alert&&!x.acknowledgedAt).length,
      source:{provider:'SAM.gov exclusions extract',sourceDate:snapshot.sourceDate||null,sourceFile:snapshot.sourceFile||null,sha256:snapshot.sha256||null,fetchedAt:snapshot.fetchedAt||null,cache:snapshot.cache,stale:Boolean(snapshot.stale)},
      items
    };
  }
}
