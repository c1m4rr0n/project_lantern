import { createHash } from 'node:crypto';

const normalize = value => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokens = value => new Set(normalize(value).split(' ').filter(x => x.length >= 2));

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return (2 * common) / (left.size + right.size);
}

function requirementFingerprint(requirement = {}) {
  return createHash('sha256')
    .update(`${normalize(requirement.text)}|${requirement.mandatory ? '1' : '0'}`)
    .digest('hex');
}

function blockerHits(profile = {}, text = '') {
  const haystack = normalize(text);
  return (profile.hardBlockers || [])
    .map(normalize)
    .filter(Boolean)
    .filter(term => haystack.includes(term));
}

function evidence(requirement = {}) {
  return {
    text: String(requirement.text || '').trim(),
    mandatory: Boolean(requirement.mandatory),
    source: String(requirement.source || 'SAM.gov description'),
    status: String(requirement.status || 'unverified')
  };
}

function classifyAdded(requirement, profile) {
  const hits = blockerHits(profile, requirement.text);
  if (hits.length) return { severity:'blocker', blockerHits:hits, reason:`Hard-blocker term matched: ${hits.join(', ')}` };
  if (requirement.mandatory) return { severity:'action', blockerHits:[], reason:'New mandatory requirement requires review.' };
  return { severity:'info', blockerHits:[], reason:'New requirement candidate detected.' };
}

function classifyModified(before, after, profile) {
  const hits = blockerHits(profile, after.text);
  if (hits.length) return { severity:'blocker', blockerHits:hits, reason:`Changed requirement now matches hard-blocker term: ${hits.join(', ')}` };
  if (!before.mandatory && after.mandatory) return { severity:'action', blockerHits:[], reason:'Requirement changed from non-mandatory to mandatory.' };
  if (after.mandatory) return { severity:'action', blockerHits:[], reason:'Mandatory requirement changed and should be re-reviewed.' };
  return { severity:'info', blockerHits:[], reason:'Requirement wording changed.' };
}

export function requirementSetFingerprint(requirements = []) {
  return createHash('sha256')
    .update((requirements || []).map(requirementFingerprint).sort().join('|'))
    .digest('hex');
}

export function detectRequirementDelta(before = [], after = [], { profile = {}, similarityThreshold = 0.58 } = {}) {
  const left = (before || []).filter(x => x?.text).map((item, index) => ({ item:evidence(item), index, key:normalize(item.text) }));
  const right = (after || []).filter(x => x?.text).map((item, index) => ({ item:evidence(item), index, key:normalize(item.text) }));
  const usedLeft = new Set();
  const usedRight = new Set();
  const unchanged = [];

  for (const l of left) {
    const match = right.find(r => !usedRight.has(r.index) && r.key === l.key && r.item.mandatory === l.item.mandatory);
    if (!match) continue;
    usedLeft.add(l.index);
    usedRight.add(match.index);
    unchanged.push({ before:l.item, after:match.item });
  }

  const candidates = [];
  for (const l of left) {
    if (usedLeft.has(l.index)) continue;
    for (const r of right) {
      if (usedRight.has(r.index)) continue;
      const score = similarity(l.item.text, r.item.text);
      if (score >= similarityThreshold) candidates.push({ left:l, right:r, score });
    }
  }
  candidates.sort((a,b)=>b.score-a.score || a.left.index-b.left.index || a.right.index-b.right.index);

  const modified = [];
  for (const candidate of candidates) {
    if (usedLeft.has(candidate.left.index) || usedRight.has(candidate.right.index)) continue;
    usedLeft.add(candidate.left.index);
    usedRight.add(candidate.right.index);
    const impact = classifyModified(candidate.left.item, candidate.right.item, profile);
    modified.push({
      before:candidate.left.item,
      after:candidate.right.item,
      similarity:Number(candidate.score.toFixed(3)),
      ...impact
    });
  }

  const added = right
    .filter(r => !usedRight.has(r.index))
    .map(r => ({ requirement:r.item, ...classifyAdded(r.item, profile) }));

  const removed = left
    .filter(l => !usedLeft.has(l.index))
    .map(l => ({ requirement:l.item, severity:l.item.mandatory ? 'easing' : 'info', reason:l.item.mandatory ? 'Mandatory requirement was removed.' : 'Requirement candidate was removed.' }));

  const blockers = [
    ...added.filter(x=>x.severity==='blocker'),
    ...modified.filter(x=>x.severity==='blocker')
  ];

  const changed = Boolean(added.length || removed.length || modified.length);
  return {
    changed,
    beforeFingerprint:requirementSetFingerprint(before),
    afterFingerprint:requirementSetFingerprint(after),
    summary:{
      added:added.length,
      removed:removed.length,
      modified:modified.length,
      blockers:blockers.length,
      actions:added.filter(x=>x.severity==='action').length + modified.filter(x=>x.severity==='action').length
    },
    added,
    removed,
    modified,
    unchangedCount:unchanged.length
  };
}
