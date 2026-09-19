export function buildDigest(profile, opportunities, now = new Date(), vendorWatch = null) {
  const active = opportunities.filter(x => x.decision?.status !== 'pass');
  const strong = active.filter(x => x.match?.score >= 75);
  const review = active.filter(x => x.match?.score >= 55 && x.match?.score < 75);
  const deadlines = active
    .filter(x => x.deadline)
    .map(x => ({ ...x, daysRemaining: Math.ceil((new Date(x.deadline) - now) / 86400000) }))
    .filter(x => x.daysRemaining >= 0 && x.daysRemaining <= 14)
    .sort((a,b)=>a.daysRemaining-b.daysRemaining);
  const changed = opportunities
    .filter(x => ['reviewing','pursue'].includes(x.decision?.status) && x.changeWatch?.unreadCount > 0)
    .sort((a,b)=>String(b.changeWatch?.latestDetectedAt || '').localeCompare(String(a.changeWatch?.latestDetectedAt || '')));

  return {
    generatedAt: now.toISOString(),
    company: profile?.name || '',
    scanned: opportunities.length,
    passedCount: opportunities.length - active.length,
    pursueCount: opportunities.filter(x => x.decision?.status === 'pursue').length,
    strongCount: strong.length,
    reviewCount: review.length,
    deadlineCount: deadlines.length,
    changedCount: changed.length,
    topMatches: strong.slice(0, 5).map(x => ({ id:x.id, title:x.title, score:x.match.score, solicitationNumber:x.solicitationNumber, deadline:x.deadline, reasons:x.match.reasons.slice(0,3), risks:x.match.risks.slice(0,2) })),
    upcomingDeadlines: deadlines.slice(0, 5).map(x => ({ id:x.id, title:x.title, daysRemaining:x.daysRemaining, deadline:x.deadline, score:x.match.score })),
    vendorWatch: vendorWatch || {total:0,excludedCount:0,possibleMatchCount:0,clearCount:0,unscreenedCount:0,alertCount:0,alerts:[]},
    changedPursuits: changed.slice(0,5).map(x => ({
      id:x.id,
      title:x.title,
      status:x.decision?.status,
      detectedAt:x.changeWatch?.latestDetectedAt,
      changes:x.changeWatch?.latest?.changes || [],
      impact:x.changeWatch?.latest?.impact || null,
      requirementDelta:x.changeWatch?.latest?.requirementDelta || null
    }))
  };
}
