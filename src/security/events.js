import { randomUUID } from 'node:crypto';
const queues = new Map();
// The single writable process serializes read/modify/write operations by tenant.
export async function withTenantLock(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.catch(()=>{}).then(task);
  queues.set(key, run);
  try { return await run; } finally { if (queues.get(key) === run) queues.delete(key); }
}
export async function audit(store, action, { subjectId = null, now = new Date() } = {}) {
  if (!/^[a-z][a-z_.]{2,60}$/.test(action)) throw new Error('invalid_audit_action');
  return withTenantLock(`events:${store.tenantId}`, async()=>{
    const events = await store.getAuditEvents();
    const days = Math.max(1, Number(process.env.AUDIT_RETENTION_DAYS) || 90);
    const event = { id:randomUUID(), action, subjectId, at:now.toISOString() };
    await store.saveAuditEvents([...events.filter(x=>Date.parse(x.at) >= now.getTime()-days*86400000),event]);
    return event;
  });
}
export function safeErrorCode(error) {
  return ['ENOENT','EACCES','ENOSPC','ETIMEDOUT','ECONNRESET'].includes(error?.code) ? error.code : 'operation_failed';
}
export function logError(event, error) {
  console.error(JSON.stringify({event,code:safeErrorCode(error),at:new Date().toISOString()}));
}
