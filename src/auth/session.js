import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = value => Buffer.from(value).toString('base64url');
const unb64 = value => Buffer.from(value, 'base64url').toString('utf8');

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken({ userId, tenantId, email, sessionVersion = 1 }, secret, { now = Date.now(), ttlSeconds = 60 * 60 * 24 * 7 } = {}) {
  if (!secret || String(secret).length < 32) throw new Error('session secret must be at least 32 characters');
  const body = b64(JSON.stringify({ userId, tenantId, email, sessionVersion:Number(sessionVersion || 1), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds }));
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(token, secret, { now = Date.now() } = {}) {
  if (!token || !secret) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(unb64(body));
    if (!data.userId || !data.tenantId || !data.exp || data.exp <= Math.floor(now / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure = false, maxAge = 604800 } = {}) {
  return `lantern_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function expiredSessionCookie({ secure = false } = {}) {
  return `lantern_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
