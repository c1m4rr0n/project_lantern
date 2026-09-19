export class FixedWindowRateLimiter {
  constructor({ limit = 10, windowMs = 15 * 60_000, now = () => Date.now(), maxKeys = 10_000 } = {}) {
    this.limit=Math.max(1,Number(limit)||10);
    this.windowMs=Math.max(1000,Number(windowMs)||900000);
    this.now=now;
    this.maxKeys=Math.max(100,Number(maxKeys)||10000);
    this.entries=new Map();
  }

  check(key) {
    const now=this.now();
    let entry=this.entries.get(key);
    if (!entry || now >= entry.resetAt) entry={count:0,resetAt:now+this.windowMs};
    entry.count += 1;
    this.entries.set(key,entry);
    if (this.entries.size > this.maxKeys) this.#prune(now);
    return {
      allowed:entry.count <= this.limit,
      remaining:Math.max(0,this.limit-entry.count),
      retryAfterSeconds:Math.max(1,Math.ceil((entry.resetAt-now)/1000)),
      resetAt:entry.resetAt
    };
  }

  #prune(now) {
    for (const [key,value] of this.entries) if (now >= value.resetAt) this.entries.delete(key);
    while (this.entries.size > this.maxKeys) this.entries.delete(this.entries.keys().next().value);
  }
}

export function requestClientKey(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded=String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded.slice(0,128);
  }
  return String(req.socket?.remoteAddress || 'unknown').slice(0,128);
}
