import { createHash } from 'node:crypto';

const KEYWORDS = /\b(shall|must|required|requirement|submit|provide|include|due|deadline|certif(?:y|ication)|registration)\b/i;
const MANDATORY = /\b(shall|must|required|is required|are required)\b/i;

function clean(line) {
  return String(line || '').replace(/^[-*•\s\d.)]+/, '').replace(/\s+/g, ' ').trim();
}

function fingerprint(text) {
  return createHash('sha256').update(String(text).trim().toLowerCase()).digest('hex').slice(0, 24);
}

export function extractRequirements(text, { source = 'SAM.gov opportunity description', max = 30 } = {}) {
  const raw = String(text || '').replace(/\r/g, '');
  const chunks = raw.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/g).map(clean).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const chunk of chunks) {
    if (chunk.length < 12 || chunk.length > 700 || !KEYWORDS.test(chunk)) continue;
    const normalizedChunk = chunk.toLowerCase();
    if (seen.has(normalizedChunk)) continue;
    seen.add(normalizedChunk);
    out.push({
      id: fingerprint(chunk),
      text: chunk,
      mandatory: MANDATORY.test(chunk),
      source,
      status: 'unverified',
      origin: 'sam-extracted'
    });
    if (out.length >= max) break;
  }
  return out;
}
