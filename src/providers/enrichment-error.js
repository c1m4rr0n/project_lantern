const statuses = { rate_limited: 503, temporarily_unavailable: 503, not_found: 404, configuration: 503, malformed: 502 };
export function enrichmentError(category, upstreamStatus = null, retryAt = null) {
  const safe = Object.hasOwn(statuses, category) ? category : 'temporarily_unavailable';
  return Object.assign(new Error(`enrichment_${safe}`), { code: `enrichment_${safe}`, category: safe, status: statuses[safe], upstreamStatus: Number.isInteger(upstreamStatus) ? upstreamStatus : null, retryAt });
}
export function safeEnrichmentError(error) {
  return Object.hasOwn(statuses, error?.category) && error.code === `enrichment_${error.category}` ? error : enrichmentError('temporarily_unavailable');
}
export function responseError(response, now = Date.now()) {
  const status = response.status;
  if (status === 429) {
    const value = response.headers?.get('retry-after');
    const until = /^\d+$/.test(value || '') ? now + Number(value) * 1000 : Date.parse(value);
    // Never retry sooner than the provider asks. Absent/invalid headers defer one minute.
    const retryAt = new Date(Number.isFinite(until) && until > now && until < 8.64e15 ? until : now + 60_000).toISOString();
    return enrichmentError('rate_limited', status, retryAt);
  }
  return enrichmentError([401,403].includes(status) ? 'configuration' : [404,410].includes(status) ? 'not_found' : status >= 500 || status === 408 ? 'temporarily_unavailable' : 'malformed', status);
}
