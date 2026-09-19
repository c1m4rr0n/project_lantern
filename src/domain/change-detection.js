import { createHash, randomUUID } from 'node:crypto';
import { scoreOpportunity } from './scoring.js';

const scalar = value => value == null || value === '' ? null : String(value);
const sorted = value => [...new Set((Array.isArray(value) ? value : []).map(x => String(x)).filter(Boolean))].sort();

export function materialSnapshot(item = {}) {
  const pop = item.placeOfPerformance || {};
  return {
    title: scalar(item.title),
    deadline: scalar(item.deadline),
    type: scalar(item.type),
    solicitationNumber: scalar(item.solicitationNumber),
    agency: scalar(item.agency),
    setAside: scalar(item.setAside),
    setAsideCode: scalar(item.setAsideCode),
    classificationCode: scalar(item.classificationCode),
    active: item.active == null ? null : Boolean(item.active),
    state: scalar(pop.state),
    city: scalar(pop.city),
    zip: scalar(pop.zip),
    naics: sorted(item.naics),
    resourceLinks: sorted(item.resourceLinks)
  };
}

export function snapshotFingerprint(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function arrayDelta(before = [], after = []) {
  const left = new Set(before);
  const right = new Set(after);
  return {
    added: after.filter(x => !left.has(x)),
    removed: before.filter(x => !right.has(x))
  };
}

export function detectMaterialChanges(existing, incoming, { detectedAt = new Date().toISOString() } = {}) {
  if (!existing || !incoming) return null;
  const before = materialSnapshot(existing);
  const after = materialSnapshot(incoming);
  const beforeFingerprint = snapshotFingerprint(before);
  const afterFingerprint = snapshotFingerprint(after);
  if (beforeFingerprint === afterFingerprint) return null;

  const changes = [];
  for (const field of Object.keys(before)) {
    const left = before[field];
    const right = after[field];
    if (Array.isArray(left) || Array.isArray(right)) {
      const delta = arrayDelta(left || [], right || []);
      if (delta.added.length || delta.removed.length) changes.push({ field, before:left || [], after:right || [], ...delta });
    } else if (left !== right) {
      changes.push({ field, before:left, after:right });
    }
  }

  const stableId = createHash('sha256')
    .update(`${existing.id || incoming.id}:${beforeFingerprint}:${afterFingerprint}`)
    .digest('hex')
    .slice(0, 24);

  return {
    id: stableId || randomUUID(),
    opportunityId: String(existing.id || incoming.id || ''),
    detectedAt,
    beforeFingerprint,
    afterFingerprint,
    changes,
    acknowledgedAt: null
  };
}

export function detectFitImpact(profile, before, after, { at = new Date().toISOString() } = {}) {
  const now = new Date(at);
  const previous = scoreOpportunity(profile || {}, before || {}, now);
  const current = scoreOpportunity(profile || {}, after || {}, now);
  const oldRisks = new Set(previous.risks || []);
  const newRisks = new Set(current.risks || []);
  return {
    scoreBefore:previous.score,
    scoreAfter:current.score,
    scoreDelta:current.score - previous.score,
    recommendationBefore:previous.recommendation,
    recommendationAfter:current.recommendation,
    blockedBefore:Boolean(previous.blocked),
    blockedAfter:Boolean(current.blocked),
    newRisks:[...newRisks].filter(x => !oldRisks.has(x)),
    resolvedRisks:[...oldRisks].filter(x => !newRisks.has(x))
  };
}
