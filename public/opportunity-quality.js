// Presentation only: these are the existing scorer thresholds, not new weights.
export function qualityLabel(score) {
  return score >= 75 ? 'Strong' : score >= 55 ? 'Relevant' : 'Low relevance';
}
export function visibleOpportunities(items, view = 'relevant') {
  return items.filter(x => view === 'explore' ? x.match.score < 55 : x.match.score >= (view === 'strong' ? 75 : 55))
    .slice().sort((a, b) => b.match.score - a.match.score);
}
export function selectedOpportunity(items, view, selected) {
  const visible = visibleOpportunities(items, view);
  if (visible.some(x => x.id === selected)) return selected;
  // Opening Explore never implies recommending or automatically opening a weak result.
  return view === 'explore' ? null : visible[0]?.id || null;
}
export function profileSignals(match) {
  const business = (match.reasons || []).filter(r => /^(NAICS match:|Capability terms matched:)/.test(r));
  return { business, conditions: (match.reasons || []).filter(r => !business.includes(r)) };
}
export function feedEmptyState(state, view) {
  if (!state.configured) return { title: 'Set up your company profile', text: 'Set up your company profile to discover relevant federal opportunities.', profile: true };
  if (view === 'explore') return { title: 'Explore lower-confidence results', text: 'These are weak profile matches, not recommendations. Select a result to inspect its evidence.' };
  if (state.summary?.relevant === 0) return { title: 'No relevant opportunities found right now.', text: 'We evaluated opportunities against your company profile, but none met the relevance threshold.', profile: true, explore: true };
  return { title: view === 'strong' ? 'No strong matches in this view' : 'No opportunities to review yet', text: 'Review your company profile or refresh opportunities when available.', profile: true };
}
