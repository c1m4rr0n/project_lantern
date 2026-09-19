import { createHash } from 'node:crypto';
export const MAX_CSV_BYTES=1024*1024, MAX_CSV_ROWS=1000;
export function parseVendorCsv(text) {
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_CSV_BYTES)throw new Error('CSV exceeds 1 MiB');
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false,closed=false;
  const cell=()=>{row.push(field);field='';closed=false;};
  const line=()=>{cell();if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>MAX_CSV_ROWS+1)throw new Error('CSV exceeds 1000 data rows');};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c==='"'){if(field||closed)throw new Error('Malformed CSV quote');quoted=true;}
    else if(c===',')cell();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
    else {if(closed)throw new Error('Unexpected text after quoted field');field+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(field||row.length||closed)line();
  if(rows.length<2)throw new Error('CSV requires a header and data');
  const aliases={legalname:'legalName',name:'legalName',vendorname:'legalName',companyname:'legalName',uei:'uei',uniqueentityid:'uei',uniqueentityidentifier:'uei',cage:'cage',cagecode:'cage',note:'notes',notes:'notes',internalnote:'notes'};
  const headers=rows.shift().map(x=>aliases[x.toLowerCase().replace(/[\s_-]/g,'')]||null);
  const supported=headers.filter(Boolean);
  if(!supported.some(x=>['legalName','uei','cage'].includes(x)))throw new Error('CSV requires a legal name, UEI or CAGE column');
  if(new Set(supported).size!==supported.length)throw new Error('Duplicate CSV column aliases');
  return rows.map((cells,index)=>({row:index+2,input:Object.fromEntries(headers.flatMap((key,i)=>key?[[key,cells[i]||'']]:[])),error:cells.length!==headers.length?'Column count does not match header':null}));
}
export function findDuplicate(vendor,existing) {
  return existing.find(v=>(vendor.uei&&v.uei===vendor.uei)||(vendor.cage&&v.cage===vendor.cage)||(!vendor.uei&&!vendor.cage&&vendor.normalizedName&&v.normalizedName===vendor.normalizedName));
}
export function previewImport(text,existing,validate,normalize) {
  const seen=[...existing];
  const rows=parseVendorCsv(text).map(row=>{
    if(row.error)return {...row,status:'invalid'};
    try {
      const value=validate(row.input);value.normalizedName=normalize(value.legalName);
      if(findDuplicate(value,seen))return {row:row.row,value,status:'duplicate',error:'Already exists or repeated in file; review archived vendors too'};
      seen.push(value);return {row:row.row,value,status:'valid'};
    } catch(error){return {row:row.row,status:'invalid',error:error.message};}
  });
  const fingerprint=createHash('sha256').update(JSON.stringify({text,existing})).digest('hex');
  return {fingerprint,rows,valid:rows.filter(x=>x.status==='valid').length,invalid:rows.filter(x=>x.status==='invalid').length,duplicates:rows.filter(x=>x.status==='duplicate').length};
}
