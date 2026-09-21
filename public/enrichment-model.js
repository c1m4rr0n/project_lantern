export function enrichmentFailure(error) {
  const code = error?.message || error;
  return ({
    enrichment_rate_limited: 'SAM.gov is limiting description requests. Please wait before trying again.',
    enrichment_temporarily_unavailable: 'SAM.gov descriptions are temporarily unavailable. Please try again later.',
    enrichment_not_found: 'The official description is unavailable for this notice.',
    enrichment_configuration: 'The description provider needs operator attention. You can still review the official notice.',
    enrichment_malformed: 'SAM.gov returned a description we could not read safely.',
    discovery_global_budget_exhausted: 'Description refresh is temporarily unavailable. Please try again after the request budget resets.',
    discovery_budget_reserved: 'Description refresh is temporarily unavailable. Please try again later.',
    discovery_budget_unavailable: 'Description refresh is temporarily unavailable. Please try again later.'
  })[code] || 'The official description could not be loaded. You can still review the official notice.';
}
export function officialSource(item) {
  try {
    const url = new URL(item.sourceUrl);
    if (url.protocol === 'https:' && ['sam.gov','www.sam.gov'].includes(url.hostname) && !url.username && !url.password) return url.href;
  } catch {}
  return /^[a-f0-9]{32}$/i.test(item.id || '') ? `https://sam.gov/opp/${item.id}/view` : '';
}
