const STATUSES = new Set(['new','reviewing','pursue','pass']);

export function validateDecision(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('decision must be an object');
  const status = String(input.status || '').trim().toLowerCase();
  if (!STATUSES.has(status)) throw new Error('status must be new, reviewing, pursue, or pass');
  const note = String(input.note ?? '').trim().slice(0, 1200);
  return { status, note, updatedAt: now.toISOString() };
}
