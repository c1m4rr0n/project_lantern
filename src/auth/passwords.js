import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEYLEN = 64;

export async function hashPassword(password) {
  const value = String(password ?? '');
  if (value.length < 10 || value.length > 200) throw new Error('password must be 10-200 characters');
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, KEYLEN);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, saltB64, hashB64] = String(encoded ?? '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = Buffer.from(await scrypt(String(password ?? ''), salt, expected.length));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
