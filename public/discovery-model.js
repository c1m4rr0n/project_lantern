export function discoveryMessage(state) {
  if(!state.configured)return 'Set up your company profile to discover relevant federal opportunities.';
  if(state.refreshUnavailable)return 'Refresh is temporarily unavailable. Your last successful results are preserved. Please try again after '+(state.refreshUnavailable.retryAt?new Date(state.refreshUnavailable.retryAt).toLocaleString():'the service is available')+'.';
  if(state.profileChanged)return 'Your company profile changed. Refresh opportunities to update these results.';
  const s=state.summary;
  if(!s)return 'Find opportunities matched to your company profile. Adding NAICS codes improves discovery quality.';
  const number=n=>Number(n||0).toLocaleString('en-US');
  return `${number(s.evaluated)} opportunities evaluated · ${number(s.relevant)} profile matches · ${number(s.pages)} SAM.gov pages searched.${state.fresh?' Recent search saved; refresh reuses these results without another SAM.gov request.':''}${s.stale?' Using cached SAM.gov data; the source could not be refreshed.':''}${['candidate_budget','request_budget','time_budget','page_budget'].includes(s.stopReason)?' Search safety limit reached; coverage is partial.':''}${!s.relevant?' No profile matches found. Review your profile or try again later.':''}`;
}
export function discoveryFailure(error) {
  const code=String(error?.message||error||'');
  if(code==='discovery_profile_required')return 'Set up your company profile to discover relevant federal opportunities.';
  if(code==='discovery_profile_changed')return 'Your profile changed during discovery. Please try again.';
  if(['discovery_global_budget_exhausted','discovery_budget_reserved','discovery_scheduled_share_exhausted','discovery_budget_unavailable'].includes(code))return 'Refresh is temporarily unavailable. Your last successful results are preserved. Please try again later.';
  if(code==='discovery_rate_limited')return 'SAM.gov is limiting requests. Your existing opportunities are unchanged. Please try again later.';
  if(code.startsWith('discovery_'))return 'We could not complete the SAM.gov search. Your existing opportunities are unchanged. Please try again later.';
  return null;
}
