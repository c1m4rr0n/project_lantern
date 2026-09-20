// Presentation only: server validation and evidence remain authoritative.
export function pursuitProfile(profile={}) {
  const name=String(profile.name||'').trim();
  const capabilities=(Array.isArray(profile.capabilities)?profile.capabilities:[]).map(x=>String(x).trim()).filter(Boolean).join(' · ');
  if(!name&&!capabilities)return {text:'Company profile not configured.',setup:true};
  return {text:name?`Matching for ${name}${capabilities?`: ${capabilities}`:''}`:`Matching your capabilities: ${capabilities}`,setup:false};
}
export const navigation=[['/vendors.html','Vendor Watch'],['/app.html','Pursuit Watch'],['/digest.html','Daily Brief'],['/onboarding.html','Company'],['/pricing.html','Plan & Billing']];
export const passwordMismatch=(password,confirmation)=>password!==confirmation;
export function humanError(error,fallback='We couldn’t complete this action. Try again or contact support.') {
  const raw=String(error?.message||error?.error||error||'');
  const messages={
    invalid_credentials:'The email or password you entered is incorrect.',email_verification_required:'Please verify your email before signing in.',
    invalid_or_expired_token:'This link has expired or has already been used. Request a new link.',password_confirmation_failed:'The password you entered is incorrect. Try again.',
    rate_limited:'Too many attempts. Please wait a few minutes and try again.',same_origin_required:'Please return to ExcluSignal and try again.',
    'account already exists':'This email is already associated with a workspace.','email already exists':'This email is already associated with a workspace.',
    'vendor already exists':'This vendor is already in your watchlist or archive.',
    'password must be 10-200 characters':'Use a password between 10 and 200 characters.',
    'CAGE must be 5 alphanumeric characters':'CAGE must contain exactly 5 alphanumeric characters.',
    'UEI must be 5-12 alphanumeric characters':'Check the UEI: enter 5–12 alphanumeric characters.',
    'legal name, UEI, or CAGE is required':'Enter a legal name, UEI or CAGE.',
    'Unclosed CSV quote':"We couldn't read this CSV. Check the file for an unclosed quotation mark and try again.",
    'Malformed CSV quote':"We couldn't read this CSV. Check quotation marks and try again.",
    'Unexpected text after quoted field':"We couldn't read this CSV. Check the text after a closing quotation mark.",
    'Column count does not match header':'This row has a different number of columns than the header.',
    'CSV exceeds 1 MiB':'Choose a CSV file no larger than 1 MiB.','CSV exceeds 1000 data rows':'Split this file into imports of up to 1,000 rows.',
    'CSV requires a header and data':'Include a header row and at least one vendor.',
    'CSV requires a legal name, UEI or CAGE column':'Include a Legal name, UEI or CAGE column.',
    'Duplicate CSV column aliases':'Use only one column for each field, such as Legal name or UEI.',
    'Watchlist changed; preview again':'Your watchlist changed. Review the import again before confirming.',
    'Failed to fetch':'Could not connect. Check your connection and try again.',Offline:'Offline. Check your connection and try again.'
  };
  return messages[raw]||fallback;
}
export function capacityCopy(billing,restore=false) {
  const ent=billing?.entitlements||{},plan=billing?.state?.plan;
  if(!ent.active)return {title:'Screening access paused',message:'Your trial or subscription is inactive. View plans to restore access. Existing evidence remains available.'};
  return restore?{title:'Cannot restore vendor',message:'Your current plan has no available vendor slots.'}:{title:'Vendor limit reached',message:`Your ${plan==='trial'?'Free Trial':plan==='team'?'Scale plan':plan==='starter'?'Starter plan':'current plan'} includes up to ${ent.vendorLimit} active vendors. Archive an existing vendor or upgrade your plan to add another.`};
}
export function importCapacity(billing,count,selected){const available=Math.max(0,Number(billing?.entitlements?.vendorLimit||0)-count);return {available,allowed:Boolean(billing?.entitlements?.active)&&selected>0&&selected<=available};}
export function classifyImport(rows,existing){return rows.map(row=>{
  if(row.status!=='duplicate')return {...row,issue:row.error?humanError(row.error,'Check this row and review the file again.'):''};
  const x=row.value||{},found=existing.find(v=>(x.uei&&x.uei===v.uei)||(x.cage&&x.cage===v.cage)||(!x.uei&&!x.cage&&x.normalizedName&&x.normalizedName===v.normalizedName));
  return {...row,issue:found?(found.archivedAt?'Already archived':'Already in your watchlist'):'Duplicate within this file'};
});}
export function sourceLabel(health,now=new Date()) {
  const meta=health?.exclusionSnapshot||{};
  if(health?.exclusionProvider==='mock')return 'Sample data · Local preview';
  if(health?.exclusionProvider!=='sam-extract')return 'SAM.gov data · Unavailable';
  if(meta.stale)return 'SAM.gov data · Refresh due — stale snapshot';
  if(meta.cache==='refreshing')return 'SAM.gov data · Refreshing';
  if(!meta.sourceDate)return 'SAM.gov data · Awaiting first screening';
  return `SAM.gov data · ${String(meta.sourceDate).slice(0,10)===now.toISOString().slice(0,10)?'Updated today':`Snapshot ${meta.sourceDate}`}`;
}
