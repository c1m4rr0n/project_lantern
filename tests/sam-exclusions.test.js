import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractFirstCsvFromZip, parseExclusionsCsv, screenVendorAgainstSnapshot, sourceDateFromFilename, SamExclusionsProvider } from '../src/providers/sam-exclusions.js';

function zipOne(filename, content) {
  const name=Buffer.from(filename);
  const raw=Buffer.from(content);
  const compressed=deflateRawSync(raw);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(0,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(0,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(0,42);
  const offset=local.length+name.length+compressed.length;
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(central.length+name.length,12);eocd.writeUInt32LE(offset,16);
  return Buffer.concat([local,name,compressed,central,name,eocd]);
}

const header=['Classification','Name','Prefix','First','Middle','Last','Suffix','Address 1','Address 2','Address 3','Address 4','City','State / Province','Country','Zip Code','Open Data Flag','Blank (Deprecated)','Unique Entity ID','Exclusion Program','Excluding Agency','CT Code','Exclusion Type','Additional Comments','Active Date','Termination Date','Record Status','Cross-Reference','SAM Number','CAGE','NPI','Creation_Date'];
const csv=(rows)=>[header,...rows].map(row=>row.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}).join(',')).join('\r\n')+'\r\n';
function firm({name='ACME, INC.',uei='ABC123DEF456',cage='1A2B3',sam='SAM-1',status='Active'}={}) {
  const row=Array(header.length).fill('');
  const set=(h,v)=>row[header.indexOf(h)]=v;
  set('Classification','Firm');set('Name',name);set('Unique Entity ID',uei);set('CAGE',cage);set('Exclusion Program','Reciprocal');set('Excluding Agency','GSA');set('Exclusion Type','Ineligible (Proceedings Completed)');set('Active Date','09/01/2026');set('Termination Date','Indefinite');set('Record Status',status);set('SAM Number',sam);set('Creation_Date','2026-09-01');
  return row;
}

test('extract parser reads official-style ZIP/CSV and keeps active firms',()=>{
  const text=csv([firm(),['Individual','Doe','','John',...Array(header.length-4).fill('')],firm({name:'Inactive Corp',uei:'ZZZ123DEF456',sam:'SAM-2',status:'Inactive'})]);
  const zip=zipOne('SAM_Exclusions_Public_Extract_V2_26260.CSV',text);
  const extracted=extractFirstCsvFromZip(zip);
  assert.equal(extracted.filename,'SAM_Exclusions_Public_Extract_V2_26260.CSV');
  const parsed=parseExclusionsCsv(extracted.data.toString('utf8'));
  assert.equal(parsed.firms.length,1);
  assert.equal(parsed.firms[0].name,'ACME, INC.');
  assert.equal(parsed.firms[0].uei,'ABC123DEF456');
  assert.equal(sourceDateFromFilename(extracted.filename),'2026-09-17');
});

test('vendor matching prioritizes exact UEI/CAGE and treats name-only match as review',()=>{
  const parsed=parseExclusionsCsv(csv([firm()]));
  const snapshot={records:parsed.firms};
  let result=screenVendorAgainstSnapshot({legalName:'Different legal name',uei:'ABC123DEF456'},snapshot);
  assert.equal(result.status,'excluded');assert.equal(result.matchType,'uei');
  result=screenVendorAgainstSnapshot({legalName:'Acme Inc',uei:'OTHER1234567'},snapshot);
  assert.equal(result.status,'possible-match');assert.equal(result.matchType,'legal-name');
  result=screenVendorAgainstSnapshot({legalName:'Totally Clear LLC',uei:'CLEAR1234567'},snapshot);
  assert.equal(result.status,'clear');
});

test('SAM exclusions provider shares a cached daily firm snapshot',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-exclusions-'));
  try{
    const text=csv([firm()]);const zip=zipOne('SAM_Exclusions_Public_Extract_V2_26260.CSV',text);let calls=0;
    const fetchImpl=async()=>{calls++;return new Response(zip,{status:200,headers:{'content-type':'application/zip'}});};
    const provider=new SamExclusionsProvider({root,apiKey:'test-key',fetchImpl,ttlMs:86_400_000,now:()=>new Date('2026-09-18T12:00:00Z')});
    const first=await provider.getSnapshot();const second=await provider.getSnapshot();
    assert.equal(calls,1);assert.equal(first.records.length,1);assert.equal(second.cache,'hit');
    assert.equal(first.sha256,createHash('sha256').update(zip).digest('hex'));
    const screened=provider.screenAgainstSnapshot({legalName:'ACME INC',uei:'ABC123DEF456'},second);
    assert.equal(screened.status,'excluded');assert.equal(screened.source.sourceDate,'2026-09-17');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('restart restores cached metadata without contacting SAM and identifies expired snapshots',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-restart-meta-'));
  try{
    await writeFile(join(root,'snapshot.json'),JSON.stringify({version:1,fetchedAt:'2026-09-18T12:00:00Z',sourceDate:'2026-09-18',sourceFile:'SAM.csv',records:[{}]}));
    let calls=0;
    const make=now=>new SamExclusionsProvider({root,apiKey:'test-key',fetchImpl:async()=>{calls++;throw new Error('Unexpected network');},now:()=>new Date(now)});
    const fresh=make('2026-09-18T13:00:00Z');await fresh.restoreMetadata();
    assert.equal(fresh.meta().sourceDate,'2026-09-18');assert.equal(fresh.meta().firmRecords,1);assert.equal(fresh.meta().stale,false);
    const old=make('2026-09-22T13:00:00Z');await old.restoreMetadata();
    assert.equal(old.meta().stale,true);assert.equal(old.meta().cache,'stale');assert.equal(calls,0);
    await writeFile(join(root,'snapshot.json'),'broken json');await fresh.restoreMetadata();
    assert.equal(fresh.meta().cache,'error');assert.equal(calls,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
