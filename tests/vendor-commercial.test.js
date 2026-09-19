import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorageManager } from '../src/storage/storage-manager.js';
import { VendorWatchService } from '../src/services/vendors.js';
import { parseVendorCsv, MAX_CSV_BYTES } from '../src/services/vendor-import.js';
import { vendorCsv, screeningReport } from '../src/services/vendor-export.js';
test('CSV handles quoted commas, escaped quotes, multiline, BOM and rejects malformed/bounds',()=>{
  const rows=parseVendorCsv('\uFEFFLegal name,UEI,Internal note\r\n"ACME, Inc",ABCDEF123456,"A ""quote""\nand newline"');
  assert.equal(rows[0].input.legalName,'ACME, Inc');assert.equal(rows[0].input.notes,'A "quote"\nand newline');
  for(const value of ['name\n"bad','name\na"b','name\n"x"oops','name,legal name\nx,y','x'.repeat(MAX_CSV_BYTES+1),'name\n'+'vendor\n'.repeat(1001)])assert.throws(()=>parseVendorCsv(value));
  assert.equal(parseVendorCsv('name\n'+'vendor\n'.repeat(1000)).length,1000);
  assert.ok(parseVendorCsv('name,uei\nonly name')[0].error);
});
for(const driver of ['sqlite','json'])test(`import, concurrency, archive and preserved history ${driver}`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-import-'));const storage=createStorageManager({driver,dataRoot:root});
  const store=storage.tenantStore('tenant-12345678');let screens=0;
  const provider={getSnapshot:async()=>({sourceDate:'2026-09-18'}),screenAgainstSnapshot:()=>{screens++;return {status:'clear',source:{sourceDate:'2026-09-18',sha256:'snapshot-hash'}};}};
  const service=new VendorWatchService({store,exclusionProvider:provider});
  const capacity=async n=>{if(n>=3)throw new Error('capacity exceeded');};
  try{
    const text='legal name,uei,cage\nAcme,ABCDEF123456,12345\nDuplicate,ABCDEF123456,\nName only,,\nName only,,\nInvalid,,TOOLONG';
    const preview=await service.previewCsv(text);assert.equal(preview.valid,2);assert.equal(preview.duplicates,2);assert.equal(preview.invalid,1);
    await assert.rejects(()=>service.importCsv({text,fingerprint:preview.fingerprint,rows:[2]} ,{capacity}),/confirmation/);
    await service.importCsv({text,fingerprint:preview.fingerprint,confirmed:true,rows:[2,4]},{capacity});assert.equal(screens,0);
    await assert.rejects(()=>service.importCsv({text,fingerprint:preview.fingerprint,confirmed:true,rows:[2,4]},{capacity}),/changed/);
    const [vendor]=await service.list();await service.screenOne(vendor.id);await service.archive(vendor.id);
    assert.equal((await service.list()).length,1);assert.equal((await service.list({archived:true})).length,1);
    assert.equal((await service.history(vendor.id)).length,1);
    const before=screens;await service.screenAll();assert.equal(screens-before,1);
    await assert.rejects(()=>service.screenOne(vendor.id),/Restore/);
    await assert.rejects(()=>service.add({uei:'ABCDEF123456'}),/exists/);
    await service.restore(vendor.id,{capacity});assert.equal((await service.history(vendor.id)).length,1);
    const results=await Promise.allSettled([service.add({legalName:'Third'},{capacity}),service.add({legalName:'Fourth'},{capacity})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await service.list()).length,3);
    assert.equal((await storage.tenantStore('tenant-87654321').getVendors()).length,0);
    const audit=await store.getAuditEvents();assert.ok(audit.some(x=>x.action==='vendor.archived'));assert.ok(audit.some(x=>x.action==='vendor.restored'));
  }finally{storage.close();await rm(root,{recursive:true,force:true});}
});
test('exports escape formula and HTML injection and never invent missing evidence',()=>{
  const vendor={legalName:'=cmd <script>alert(1)</script>',uei:'',cage:'',watch:{latest:{status:'possible-match',matches:[]}}};
  assert.match(vendorCsv([vendor]),/"'=cmd/);
  const html=screeningReport(vendor,[{status:'possible-match',matches:[{name:'<img onerror=alert(1)>'}]}]);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.match(html,/REVIEW REQUIRED/);assert.match(html,/Not available/);assert.match(html,/not a legal eligibility determination/);
});
