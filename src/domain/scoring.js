function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    for (const key of ['code','name','value','abbreviation','stateCode','stateName']) {
      const resolved = scalar(value[key]);
      if (resolved) return resolved;
    }
    return '';
  }
  return String(value);
}
const normalize = (value = '') => scalar(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, ' ');
const words = (value = '') => new Set(normalize(value).split(/\s+/).filter(w => w.length >= 3));

function capabilityScore(profile, opportunity) {
  const haystack = words(`${opportunity.title || ''} ${opportunity.description || ''}`);
  const caps = (profile.capabilities || []).flatMap(c => [...words(c)]);
  if (!caps.length) return { points: 0, matches: [] };
  const matches = [...new Set(caps.filter(c => haystack.has(c)))];
  const ratio = matches.length / Math.max(1, new Set(caps).size);
  return { points: Math.round(Math.min(25, ratio * 40)), matches };
}

export function scoreOpportunity(profile, opportunity, now = new Date()) {
  let score = 0;
  const reasons = [];
  const risks = [];

  const profileNaics = new Set((profile.naics || []).map(String));
  const oppNaics = (opportunity.naics || []).map(String);
  const naicsMatches = oppNaics.filter(n => profileNaics.has(n));
  if (naicsMatches.length) {
    score += 25;
    reasons.push(`NAICS match: ${naicsMatches.join(', ')}`);
  } else if (oppNaics.length) {
    risks.push(`No exact NAICS match (${oppNaics.join(', ')})`);
  }

  const caps = capabilityScore(profile, opportunity);
  score += caps.points;
  if (caps.matches.length) reasons.push(`Capability terms matched: ${caps.matches.slice(0, 6).join(', ')}`);
  else risks.push('No strong capability keyword match detected');

  const setAside = normalize(opportunity.setAside || '');
  const profileSetAsides = (profile.setAsides || []).map(normalize);
  if (!setAside) {
    score += 5;
    reasons.push('No set-aside restriction detected');
  } else if (profileSetAsides.some(s => setAside.includes(s) || s.includes(setAside))) {
    score += 15;
    reasons.push(`Set-aside appears compatible: ${opportunity.setAside}`);
  } else {
    risks.push(`Set-aside may not match company profile: ${scalar(opportunity.setAside)}`);
  }

  const region = normalize(opportunity.placeOfPerformance?.state || opportunity.state || '');
  const regions = (profile.regions || []).map(normalize);
  if (!region || regions.includes('remote') || regions.includes(region)) {
    score += 10;
    reasons.push(region ? `Place of performance fits profile: ${region.toUpperCase()}` : 'No restrictive place of performance detected');
  } else {
    risks.push(`Place of performance outside preferred regions: ${region.toUpperCase()}`);
  }

  if (opportunity.deadline) {
    const days = Math.ceil((new Date(opportunity.deadline) - now) / 86400000);
    if (days >= 14) {
      score += 10;
      reasons.push(`${days} days remain before deadline`);
    } else if (days >= 7) {
      score += 6;
      risks.push(`Only ${days} days remain before deadline`);
    } else if (days >= 0) {
      score += 2;
      risks.push(`Urgent: only ${days} days remain before deadline`);
    } else {
      risks.push('Deadline has passed');
    }
  }

  const type = normalize(opportunity.type || '');
  if (['solicitation', 'combined synopsis solicitation', 'sources sought', 'presolicitation'].some(t => type.includes(t))) {
    score += 10;
    reasons.push(`Actionable notice type: ${scalar(opportunity.type)}`);
  }

  const negativeKeywords = (profile.negativeKeywords || []).map(normalize).filter(Boolean);
  const allText = normalize(`${opportunity.title || ''} ${opportunity.description || ''}`);
  const negatives = negativeKeywords.filter(k => allText.includes(k));
  if (negatives.length) {
    score -= Math.min(25, negatives.length * 10);
    risks.push(`Negative keyword hit: ${negatives.join(', ')}`);
  }

  const hardBlockers = (profile.hardBlockers || []).map(normalize).filter(Boolean);
  const blockers = hardBlockers.filter(k => allText.includes(k));
  if (blockers.length) {
    score = 0;
    risks.unshift(`Hard blocker detected: ${blockers.join(', ')}`);
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = blockers.length ? 'skip' : score >= 75 ? 'review-now' : score >= 55 ? 'review' : 'skip';
  return { score, recommendation, reasons, risks, blocked:Boolean(blockers.length), blockers };
}
