export function buildVendorDigest(vendors = []) {
  const items=Array.isArray(vendors)?vendors:[];
  const latest=v=>v.watch?.latest||v.latestScreening||null;
  const alerts=items.filter(v=>(v.watch?.unreadCount||0)>0);
  return {
    total:items.length,
    excludedCount:items.filter(v=>latest(v)?.status==='excluded').length,
    possibleMatchCount:items.filter(v=>latest(v)?.status==='possible-match').length,
    clearCount:items.filter(v=>latest(v)?.status==='clear').length,
    unscreenedCount:items.filter(v=>!latest(v)).length,
    alertCount:alerts.length,
    alerts:alerts.slice(0,10).map(v=>({
      id:v.id,
      legalName:v.legalName,
      uei:v.uei||null,
      cage:v.cage||null,
      status:latest(v)?.status||'unknown',
      previousStatus:latest(v)?.previousStatus||null,
      reason:latest(v)?.reason||'',
      screenedAt:latest(v)?.screenedAt||null,
      source:latest(v)?.source||null,
      matches:(latest(v)?.matches||[]).slice(0,3)
    }))
  };
}
