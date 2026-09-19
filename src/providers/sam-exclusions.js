import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const EXTRACT_URL = 'https://api.sam.gov/data-services/v1/extracts';
const DAY_MS = 86_400_000;

const clean = value => String(value ?? '').trim();
export const normalizeIdentifier = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normalizeLegalName = value => clean(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/&/g, ' AND ')
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function atomicFile(path, data, options = {}) {
  await mkdir(dirname(path), { recursive:true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data, options);
  await rename(tmp, path);
}

function findEocd(zip) {
  const min = Math.max(0, zip.length - 65_557);
  for (let i = zip.length - 22; i >= min; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('invalid zip: end of central directory not found');
}

export function extractFirstCsvFromZip(zipInput) {
  const zip = Buffer.isBuffer(zipInput) ? zipInput : Buffer.from(zipInput);
  const eocd = findEocd(zip);
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('invalid zip: central directory entry missing');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const filename = zip.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    if (/\.csv$/i.test(filename)) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('invalid zip: local file header missing');
      const localNameLen = zip.readUInt16LE(localOffset + 26);
      const localExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = zip.subarray(start, start + compressedSize);
      let data;
      if (method === 0) data = Buffer.from(compressed);
      else if (method === 8) data = inflateRawSync(compressed);
      else throw new Error(`unsupported zip compression method ${method}`);
      if (uncompressedSize && data.length !== uncompressedSize) throw new Error('invalid zip: uncompressed size mismatch');
      return { filename, data };
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('zip did not contain a CSV file');
}

export function forEachCsvRow(text, callback) {
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.length === 0) { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') {
      row.push(field.replace(/\r$/,''));
      callback(row);
      row = []; field = '';
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/,'')); callback(row); }
}

function valueFor(record, ...names) {
  for (const name of names) if (Object.prototype.hasOwnProperty.call(record, name)) return clean(record[name]);
  return '';
}

export function parseExclusionsCsv(text) {
  let headers = null;
  const firms = [];
  forEachCsvRow(text, row => {
    if (!headers) {
      headers = row.map(x => clean(x).replace(/^\uFEFF/,''));
      return;
    }
    if (!row.some(Boolean)) return;
    const record = Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']));
    const classification = valueFor(record, 'Classification');
    if (classification.toLowerCase() !== 'firm') return;
    const status = valueFor(record, 'Record Status', 'Record_Status');
    if (status && status.toLowerCase() !== 'active') return;
    firms.push({
      classification,
      name:valueFor(record,'Name'),
      normalizedName:normalizeLegalName(valueFor(record,'Name')),
      uei:normalizeIdentifier(valueFor(record,'Unique Entity ID','Unique_Entity_ID','UEI')),
      cage:normalizeIdentifier(valueFor(record,'CAGE','CAGE Code','CAGE_Code')),
      excludingAgency:valueFor(record,'Excluding Agency','Excluding_Agency'),
      exclusionProgram:valueFor(record,'Exclusion Program','Exclusion_Program'),
      exclusionType:valueFor(record,'Exclusion Type','Exclusion_Type'),
      activeDate:valueFor(record,'Active Date','Active_Date'),
      terminationDate:valueFor(record,'Termination Date','Termination_Date'),
      recordStatus:status || 'Active',
      crossReference:valueFor(record,'Cross-Reference','Cross Reference','Cross_Reference'),
      samNumber:valueFor(record,'SAM Number','SAM_Number'),
      cageRaw:valueFor(record,'CAGE','CAGE Code','CAGE_Code'),
      ueiRaw:valueFor(record,'Unique Entity ID','Unique_Entity_ID','UEI'),
      creationDate:valueFor(record,'Creation_Date','Creation Date'),
      city:valueFor(record,'City'),
      state:valueFor(record,'State / Province','State/Province','State'),
      country:valueFor(record,'Country'),
      zip:valueFor(record,'Zip Code','ZIP Code','Zip_Code'),
      address1:valueFor(record,'Address 1','Address_1')
    });
  });
  if (!headers?.includes('Classification') || !headers?.some(x => ['Name'].includes(x))) throw new Error('unexpected SAM exclusions CSV header');
  return { headers, firms };
}

export function sourceDateFromFilename(filename) {
  const m = String(filename || '').match(/_(\d{2})(\d{3})\.CSV$/i);
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  const day = Number(m[2]);
  if (!day || day > 366) return null;
  const d = new Date(Date.UTC(year, 0, day));
  return d.getUTCFullYear() === year ? d.toISOString().slice(0,10) : null;
}

function indexSnapshot(snapshot) {
  const byUei = new Map();
  const byCage = new Map();
  const byName = new Map();
  const add = (map, key, record) => { if (!key) return; const list = map.get(key) || []; list.push(record); map.set(key, list); };
  for (const record of snapshot.records || []) {
    add(byUei, record.uei, record);
    add(byCage, record.cage, record);
    add(byName, record.normalizedName, record);
  }
  return { byUei, byCage, byName };
}

function publicMatch(record) {
  return {
    samNumber:record.samNumber || null,
    name:record.name || null,
    uei:record.ueiRaw || record.uei || null,
    cage:record.cageRaw || record.cage || null,
    excludingAgency:record.excludingAgency || null,
    exclusionProgram:record.exclusionProgram || null,
    exclusionType:record.exclusionType || null,
    activeDate:record.activeDate || null,
    terminationDate:record.terminationDate || null,
    city:record.city || null,
    state:record.state || null,
    country:record.country || null
  };
}

export function screenVendorAgainstSnapshot(vendor, snapshot) {
  if (!snapshot?.records) return { status:'unavailable', matchType:null, matches:[], reason:'No exclusions snapshot is available.' };
  const idx = snapshot._index || (snapshot._index = indexSnapshot(snapshot));
  const uei = normalizeIdentifier(vendor?.uei);
  const cage = normalizeIdentifier(vendor?.cage);
  const name = normalizeLegalName(vendor?.legalName || vendor?.name);
  const exactUei = uei ? (idx.byUei.get(uei) || []) : [];
  const exactCage = cage ? (idx.byCage.get(cage) || []) : [];
  let candidates = [...exactUei, ...exactCage];
  const unique = new Map(candidates.map(x => [x.samNumber || `${x.name}:${x.activeDate}:${x.excludingAgency}`, x]));
  candidates = [...unique.values()];
  if (candidates.length) {
    const matchType = exactUei.length ? (exactCage.length ? 'uei+cage' : 'uei') : 'cage';
    return {
      status:'excluded',
      matchType,
      confidence:'high',
      reason:`Exact ${matchType.toUpperCase().replace('+',' + ')} match found in the active SAM.gov exclusions extract.`,
      matches:candidates.slice(0,25).map(publicMatch)
    };
  }
  const nameMatches = name ? (idx.byName.get(name) || []) : [];
  if (nameMatches.length) {
    const identifierSupplied = Boolean(uei || cage);
    return {
      status:'possible-match',
      matchType:'legal-name',
      confidence:identifierSupplied ? 'low' : 'medium',
      reason:identifierSupplied
        ? 'The legal name matches an active exclusion, but the supplied UEI/CAGE did not match. Review manually before treating this vendor as excluded.'
        : 'The legal name matches an active exclusion. Add UEI or CAGE to confirm identity before treating this vendor as excluded.',
      matches:nameMatches.slice(0,25).map(publicMatch)
    };
  }
  return { status:'clear', matchType:null, confidence:'high', reason:'No exact UEI, CAGE, or normalized legal-name match was found in the active SAM.gov exclusions extract.', matches:[] };
}

function stripInternal(snapshot) {
  if (!snapshot) return snapshot;
  const { _index, ...rest } = snapshot;
  return rest;
}

export class SamExclusionsProvider {
  constructor({ root, apiKey, ttlMs = 20 * 60 * 60 * 1000, maxStaleMs = 72 * 60 * 60 * 1000, timeoutMs = 300_000, fetchImpl = fetch, now = () => new Date() }) {
    this.root = root;
    this.apiKey = apiKey;
    this.ttlMs = Number(ttlMs);
    this.maxStaleMs = Number(maxStaleMs);
    this.timeoutMs = Number(timeoutMs);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.snapshotPath = join(root, 'snapshot.json');
    this.zipPath = join(root, 'latest.zip');
    this.inFlight = null;
    this.lastMeta = { configured:Boolean(apiKey), cache:'empty', fetchedAt:null, sourceDate:null, sourceFile:null, firmRecords:null, stale:null };
  }

  meta() { return structuredClone(this.lastMeta); }

  async #readCache() {
    try {
      const parsed = JSON.parse(await readFile(this.snapshotPath,'utf8'));
      return parsed?.version === 1 && Array.isArray(parsed.records) ? parsed : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async getSnapshot({ force = false } = {}) {
    if (!this.apiKey) throw new Error('SAM exclusions provider is not configured');
    const now = this.now();
    const cached = await this.#readCache();
    const age = cached?.fetchedAt ? now - new Date(cached.fetchedAt) : Infinity;
    if (!force && cached && age <= this.ttlMs) {
      const result = { ...cached, stale:false, cache:'hit' };
      this.lastMeta = { configured:true, cache:'hit', fetchedAt:result.fetchedAt, sourceDate:result.sourceDate, sourceFile:result.sourceFile, firmRecords:result.records.length, stale:false };
      return result;
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#refresh(cached, now).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async #refresh(cached, now) {
    try {
      const url = new URL(EXTRACT_URL);
      url.searchParams.set('api_key', this.apiKey);
      url.searchParams.set('fileType','EXCLUSION');
      url.searchParams.set('sensitivity','PUBLIC');
      url.searchParams.set('frequency','DAILY');
      url.searchParams.set('version','V2');
      const response = await this.fetchImpl(url, { redirect:'follow', signal:AbortSignal.timeout(this.timeoutMs), headers:{'user-agent':'ExcluSignal/1.0 vendor-watch'} });
      if (!response.ok) throw new Error(`SAM exclusions extract request failed (${response.status})`);
      const zip = Buffer.from(await response.arrayBuffer());
      if (zip.length < 4 || zip.readUInt32LE(0) !== 0x04034b50) throw new Error('SAM exclusions extract response was not a ZIP archive');
      const sha256 = createHash('sha256').update(zip).digest('hex');
      const { filename, data } = extractFirstCsvFromZip(zip);
      const { headers, firms } = parseExclusionsCsv(data.toString('utf8'));
      const snapshot = {
        version:1,
        fetchedAt:now.toISOString(),
        sourceDate:sourceDateFromFilename(filename),
        sourceFile:filename,
        sha256,
        headers,
        records:firms
      };
      await mkdir(this.root,{recursive:true});
      await atomicFile(this.zipPath,zip,{mode:0o600});
      await atomicFile(this.snapshotPath,JSON.stringify(snapshot),{mode:0o600});
      const result={...snapshot,stale:false,cache:'refresh'};
      this.lastMeta={configured:true,cache:'refresh',fetchedAt:result.fetchedAt,sourceDate:result.sourceDate,sourceFile:result.sourceFile,firmRecords:firms.length,stale:false};
      return result;
    } catch (error) {
      const age = cached?.fetchedAt ? now - new Date(cached.fetchedAt) : Infinity;
      if (cached && age <= this.maxStaleMs) {
        const result={...cached,stale:true,cache:'stale',staleReason:String(error.message||error)};
        this.lastMeta={configured:true,cache:'stale',fetchedAt:result.fetchedAt,sourceDate:result.sourceDate,sourceFile:result.sourceFile,firmRecords:result.records.length,stale:true,error:String(error.message||error)};
        return result;
      }
      this.lastMeta={...this.lastMeta,configured:true,cache:'error',stale:null,error:String(error.message||error)};
      throw error;
    }
  }

  screenAgainstSnapshot(vendor, snapshot) {
    const result = screenVendorAgainstSnapshot(vendor, snapshot);
    return {
      ...result,
      source:{
        provider:'SAM.gov exclusions extract',
        sourceDate:snapshot?.sourceDate || null,
        sourceFile:snapshot?.sourceFile || null,
        sha256:snapshot?.sha256 || null,
        fetchedAt:snapshot?.fetchedAt || null,
        cache:snapshot?.cache || null,
        stale:Boolean(snapshot?.stale)
      }
    };
  }

  async screen(vendor, options = {}) {
    const snapshot = await this.getSnapshot(options);
    return this.screenAgainstSnapshot(vendor, snapshot);
  }
}
