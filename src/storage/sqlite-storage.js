import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

const SAFE_TENANT = /^[a-zA-Z0-9-]{8,80}$/;
const cleanEmail = value => String(value ?? '').trim().toLowerCase();
const clone = value => structuredClone(value);
const tokenHash = token => createHash('sha256').update(String(token)).digest('hex');

function parseJson(value, fallback) {
  if (value == null) return clone(fallback);
  try { return JSON.parse(value); }
  catch { throw new Error('corrupt sqlite document'); }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id:row.id,
    tenantId:row.tenant_id,
    email:row.email,
    createdAt:row.created_at,
    emailVerifiedAt:row.email_verified_at || null,
    sessionVersion:Number(row.session_version || 1)
  };
}

export class SqliteStorageManager {
  constructor({ path }) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const hadAccounts=Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get());
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        email_verified_at TEXT,
        session_version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS tenant_documents (
        tenant_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, kind)
      );
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(kind, token_hash, consumed_at);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_account ON auth_tokens(account_id, kind, created_at);
    `);
    const columns=new Set(this.db.prepare('PRAGMA table_info(accounts)').all().map(x=>x.name));
    if (!columns.has('email_verified_at')) {
      this.db.exec('ALTER TABLE accounts ADD COLUMN email_verified_at TEXT;');
      // Accounts created before verification existed are grandfathered as verified.
      this.db.exec('UPDATE accounts SET email_verified_at = created_at WHERE email_verified_at IS NULL;');
    } else if (hadAccounts) {
      // No-op: preserve explicit unverified rows created by newer versions.
    }
    if (!columns.has('session_version')) this.db.exec('ALTER TABLE accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;');
    this.accountStore = new SqliteAccountStore(this.db);
  }

  tenantStore(tenantId, options = {}) {
    return new SqliteTenantStore({ db: this.db, tenantId, ...options });
  }

  async integrityCheck() { return this.db.prepare('PRAGMA quick_check').get()?.quick_check || 'unknown'; }

  close() { this.db.close(); }
}

export class SqliteAccountStore {
  constructor(db) { this.db = db; }

  async register({ email, password }) {
    const normalized = cleanEmail(email);
    if (!/^\S+@\S+\.\S+$/.test(normalized) || normalized.length > 254) throw new Error('valid email is required');
    const exists = this.db.prepare('SELECT 1 FROM accounts WHERE email = ?').get(normalized);
    if (exists) throw new Error('account already exists');
    const now = new Date().toISOString();
    const user = { id: randomUUID(), tenantId: randomUUID(), email: normalized, passwordHash: await hashPassword(password), createdAt: now };
    try {
      this.db.prepare('INSERT INTO accounts (id, tenant_id, email, password_hash, created_at, email_verified_at, session_version) VALUES (?, ?, ?, ?, ?, NULL, 1)')
        .run(user.id, user.tenantId, user.email, user.passwordHash, user.createdAt);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) throw new Error('account already exists');
      throw error;
    }
    return { id:user.id, tenantId:user.tenantId, email:user.email, createdAt:user.createdAt, emailVerifiedAt:null, sessionVersion:1 };
  }

  async authenticate({ email, password }) {
    const normalized = cleanEmail(email);
    const row = this.db.prepare('SELECT id, tenant_id, email, password_hash, created_at, email_verified_at, session_version FROM accounts WHERE email = ?').get(normalized);
    if (!row || !(await verifyPassword(password, row.password_hash))) return null;
    return publicUser(row);
  }

  async getSessionIdentity(userId) {
    const row=this.db.prepare('SELECT id, tenant_id, email, created_at, email_verified_at, session_version FROM accounts WHERE id = ?').get(String(userId));
    return publicUser(row);
  }

  async listUsers() {
    return this.db.prepare('SELECT id, tenant_id, email, created_at, email_verified_at, session_version FROM accounts ORDER BY created_at ASC').all().map(publicUser);
  }

  async count() { return Number(this.db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count || 0); }

  async issueEmailVerification({ email, now=new Date(), ttlMs=24*60*60*1000 }) {
    const row=this.db.prepare('SELECT id, tenant_id, email, created_at, email_verified_at, session_version FROM accounts WHERE email = ?').get(cleanEmail(email));
    if (!row || row.email_verified_at) return null;
    return this.#issueToken({account:row,kind:'verify-email',now,ttlMs});
  }

  async verifyEmailToken(token, { now=new Date() } = {}) {
    const hash=tokenHash(token);
    const row=this.db.prepare(`SELECT t.id token_id,t.account_id,t.expires_at,t.consumed_at,a.id,a.tenant_id,a.email,a.created_at,a.email_verified_at,a.session_version
      FROM auth_tokens t JOIN accounts a ON a.id=t.account_id WHERE t.kind='verify-email' AND t.token_hash=?`).get(hash);
    if (!row || row.consumed_at || new Date(row.expires_at) <= now) return null;
    const verifiedAt=now.toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const used=this.db.prepare("UPDATE auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL").run(verifiedAt,row.token_id);
      if (Number(used.changes)!==1) { this.db.exec('ROLLBACK'); return null; }
      this.db.prepare('UPDATE accounts SET email_verified_at=COALESCE(email_verified_at, ?) WHERE id=?').run(verifiedAt,row.account_id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.getSessionIdentity(row.account_id);
  }

  async issuePasswordReset({ email, now=new Date(), ttlMs=60*60*1000 }) {
    const row=this.db.prepare('SELECT id, tenant_id, email, created_at, email_verified_at, session_version FROM accounts WHERE email = ?').get(cleanEmail(email));
    if (!row) return null;
    return this.#issueToken({account:row,kind:'password-reset',now,ttlMs});
  }

  async resetPasswordWithToken(token, newPassword, { now=new Date() } = {}) {
    const hash=tokenHash(token);
    const row=this.db.prepare(`SELECT t.id token_id,t.account_id,t.expires_at,t.consumed_at,a.id,a.tenant_id,a.email,a.created_at,a.email_verified_at,a.session_version
      FROM auth_tokens t JOIN accounts a ON a.id=t.account_id WHERE t.kind='password-reset' AND t.token_hash=?`).get(hash);
    if (!row || row.consumed_at || new Date(row.expires_at) <= now) return null;
    const passwordHash=await hashPassword(newPassword);
    const consumedAt=now.toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const used=this.db.prepare('UPDATE auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(consumedAt,row.token_id);
      if (Number(used.changes)!==1) { this.db.exec('ROLLBACK'); return null; }
      this.db.prepare('UPDATE accounts SET password_hash=?, email_verified_at=COALESCE(email_verified_at, ?), session_version=session_version+1 WHERE id=?').run(passwordHash,consumedAt,row.account_id);
      this.db.prepare("UPDATE auth_tokens SET consumed_at=? WHERE account_id=? AND kind='password-reset' AND consumed_at IS NULL").run(consumedAt,row.account_id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.getSessionIdentity(row.account_id);
  }

  #issueToken({ account, kind, now, ttlMs }) {
    const token=randomBytes(32).toString('base64url');
    const id=randomUUID();
    const createdAt=now.toISOString();
    const expiresAt=new Date(now.getTime()+Math.max(60_000,Number(ttlMs)||60_000)).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE auth_tokens SET consumed_at=? WHERE account_id=? AND kind=? AND consumed_at IS NULL').run(createdAt,account.id,kind);
      this.db.prepare('INSERT INTO auth_tokens (id, account_id, kind, token_hash, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, NULL)')
        .run(id,account.id,kind,tokenHash(token),createdAt,expiresAt);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { token, tokenId:id, kind, expiresAt, user:publicUser(account) };
  }
}

export class SqliteTenantStore {
  constructor({ db, tenantId, seedProfile = null, seedOpportunities = [] }) {
    if (!SAFE_TENANT.test(String(tenantId))) throw new Error('invalid tenant id');
    this.db = db;
    this.tenantId = String(tenantId);
    this.seedProfile = seedProfile;
    this.seedOpportunities = seedOpportunities;
    this.getStmt = db.prepare('SELECT json FROM tenant_documents WHERE tenant_id = ? AND kind = ?');
    this.putStmt = db.prepare(`
      INSERT INTO tenant_documents (tenant_id, kind, json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(tenant_id, kind) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
    `);
  }

  #get(kind, fallback) {
    const row = this.getStmt.get(this.tenantId, kind);
    return parseJson(row?.json, fallback);
  }

  #put(kind, value) {
    this.putStmt.run(this.tenantId, kind, JSON.stringify(value), new Date().toISOString());
    return value;
  }

  async getProfile() { return this.#get('profile', this.seedProfile || { name:'', naics:[], capabilities:[], setAsides:[], regions:[], negativeKeywords:[], hardBlockers:[] }); }
  async saveProfile(profile) { return this.#put('profile', profile); }
  async getOpportunities() { return this.#get('opportunities', this.seedOpportunities); }
  async saveOpportunities(items) { return this.#put('opportunities', items); }
  async findOpportunity(id) { return (await this.getOpportunities()).find(x => String(x.id) === String(id)) || null; }
  async replaceOpportunity(item) {
    const items = await this.getOpportunities();
    const index = items.findIndex(x => String(x.id) === String(item.id));
    if (index < 0) throw new Error('opportunity not found');
    items[index] = item;
    await this.saveOpportunities(items);
    return item;
  }
  async getDecisions() { return this.#get('decisions', {}); }
  async saveDecision(opportunityId, decision) {
    const all = await this.getDecisions();
    all[String(opportunityId)] = decision;
    this.#put('decisions', all);
    return decision;
  }
  async getOpportunityChanges(opportunityId = null) {
    const all = this.#get('opportunity-changes', {});
    return opportunityId == null ? all : (all[String(opportunityId)] || []);
  }
  async appendOpportunityChange(opportunityId, event, { limit = 50 } = {}) {
    const all = await this.getOpportunityChanges();
    const key = String(opportunityId);
    const history = Array.isArray(all[key]) ? all[key] : [];
    if (history.some(x => x.id === event.id)) return event;
    history.push(event);
    all[key] = history.slice(-Math.max(1, Number(limit) || 50));
    this.#put('opportunity-changes', all);
    return event;
  }
  async acknowledgeOpportunityChanges(opportunityId, { now = new Date() } = {}) {
    const all = await this.getOpportunityChanges();
    const key = String(opportunityId);
    const history = Array.isArray(all[key]) ? all[key] : [];
    const acknowledgedAt = now.toISOString();
    let changed = 0;
    all[key] = history.map(event => {
      if (event.acknowledgedAt) return event;
      changed++;
      return { ...event, acknowledgedAt };
    });
    this.#put('opportunity-changes', all);
    return { acknowledged: changed, acknowledgedAt };
  }
  async getAuditEvents() { return this.#get('audit-events', []); }
  async saveAuditEvents(events) { return this.#put('audit-events', events); }
  async getVendors() { return this.#get('vendors', []); }
  async saveVendors(vendors) { return this.#put('vendors', vendors); }
  async getBilling() { return this.#get('billing', null); }
  async saveBilling(state) { return this.#put('billing', state); }
  async getVendorScreenings(vendorId = null) {
    const all = this.#get('vendor-screenings', {});
    return vendorId == null ? all : (all[String(vendorId)] || []);
  }
  async appendVendorScreening(vendorId, screening, { limit = 730 } = {}) {
    const all = await this.getVendorScreenings();
    const key = String(vendorId);
    const history = Array.isArray(all[key]) ? all[key] : [];
    if (history.some(x => x.id === screening.id)) return screening;
    history.push(screening);
    all[key] = history.slice(-Math.max(1, Number(limit) || 730));
    this.#put('vendor-screenings', all);
    return screening;
  }
  async acknowledgeVendorScreenings(vendorId, { now = new Date() } = {}) {
    const all = await this.getVendorScreenings();
    const key = String(vendorId);
    const history = Array.isArray(all[key]) ? all[key] : [];
    const acknowledgedAt = now.toISOString();
    let changed = 0;
    all[key] = history.map(event => {
      if (!event.alert || event.acknowledgedAt) return event;
      changed++;
      return { ...event, acknowledgedAt };
    });
    this.#put('vendor-screenings', all);
    return { acknowledged: changed, acknowledgedAt };
  }
}
