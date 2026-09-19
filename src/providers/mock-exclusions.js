import { screenVendorAgainstSnapshot } from './sam-exclusions.js';

const records=[{
  classification:'Firm',name:'Risk Vendor LLC',normalizedName:'RISK VENDOR LLC',uei:'RISK12345678',ueiRaw:'RISK12345678',cage:'9RISK',cageRaw:'9RISK',excludingAgency:'GSA',exclusionProgram:'Reciprocal',exclusionType:'Ineligible (Proceedings Completed)',activeDate:'09/01/2026',terminationDate:'Indefinite',recordStatus:'Active',samNumber:'MOCK-EXCLUSION-1',creationDate:'2026-09-01',city:'Washington',state:'DC',country:'USA'
}];

export class MockExclusionsProvider {
  meta(){return{configured:true,cache:'mock',fetchedAt:'2026-09-18T00:00:00Z',sourceDate:'2026-09-18',sourceFile:'mock-exclusions.csv',firmRecords:records.length,stale:false};}
  async getSnapshot(){return{version:1,records,sourceDate:'2026-09-18',sourceFile:'mock-exclusions.csv',sha256:'mock',fetchedAt:'2026-09-18T00:00:00Z',cache:'mock',stale:false};}
  screenAgainstSnapshot(vendor,snapshot){const result=screenVendorAgainstSnapshot(vendor,snapshot);return{...result,source:{provider:'Mock exclusions',sourceDate:snapshot.sourceDate,sourceFile:snapshot.sourceFile,sha256:snapshot.sha256,fetchedAt:snapshot.fetchedAt,cache:'mock',stale:false}};}
  async screen(vendor){return this.screenAgainstSnapshot(vendor,await this.getSnapshot());}
}
