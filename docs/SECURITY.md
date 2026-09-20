# Security baseline — source RC21 candidate

The operator reports RC20 production from GitHub source; RC21 remains a separate, unmerged candidate. See CURRENT_DEPLOYMENT.md.

## Implemented controls

- Salted scrypt password hashes; signed HttpOnly SameSite=Lax sessions, Secure required in production.
- Verified-email gate, one-time hashed verification/reset tokens and session-version revocation after password reset.
- Tenant-bound storage and validated tenant paths; server-side subscription/capacity checks.
- Request body limits, auth/account-action rate limiting, safe static headers and restrictive report CSP.
- Export/delete require verified session, matching Origin and current password; delete additionally requires explicit DELETE confirmation and confirmed ended billing.
- Archive rather than destructive vendor removal; retained evidence is available for archived records.
- CSV size/row caps, canonical validation and serialized capacity/duplicate checks; output formula neutralization and HTML escaping.
- Durable audit for verification, login, reset, logout, billing state, archive/restore and account export/deletion.
- Minimal first-party analytics; no public customer analytics endpoint.
- Signed raw-body Stripe webhook verification, durable processed event IDs, stale-event/terminal-subscription protection; unknown/deleted tenants are ignored.
- SAM credentials remain server-only; enrichment hosts are allowlisted. Public health masks raw upstream/scheduler errors.
- Structured operational error logs use allowlisted codes, never raw request bodies, cookies, auth links or provider credentials.
- Durable outbox retries with provider idempotency; delivered sensitive auth payloads are redacted.
- Deletion drains application/scheduler work, revokes credentials, cleans tenant/outbox data and persists restart-recovery jobs. Cleanup failure puts the process into 503 recovery mode until repaired/restarted.
- Fail-fast production configuration, persistent data-root/volume checks, SQLite integrity and single writable instance.
- Release gate secret scanning; explicit Docker COPY excludes secrets, databases, handoff and release artifacts.

## RC20 presentation boundary

RC21 adds a shared, serialized SAM request ledger with optional operator budget, persisted UTC usage and fair scheduled reservations. Counters contain no profiles/credentials; public/tenant endpoints do not expose aggregate customer usage. Budget denial preserves the successful feed/summary and prevents retry storms. The ledger assumes the existing single writable process/data root, not distributed enforcement across external apps. Manual sync reuses fresh profile-identical results (including tracked refresh) and ignores user-supplied force-refresh fields. See OPPORTUNITY_DISCOVERY.md for limits, failure handling and accounting boundaries.

Verified sessions entering `/` or `/auth.html` without verify/reset parameters are redirected to Vendor Watch. Token flows and unauthenticated entry remain available. Password confirmation is a client convenience; server validation, generic recovery responses, password reauthentication, DELETE confirmation and entitlements remain authoritative. Human error copy is allowlisted and never includes unknown raw diagnostics. Shared dialogs use native modal focus containment and explicit confirmation. Report evidence remains escaped, and no-match results are not eligibility determinations.

## Retention and residual boundaries

RC21 discovery requires an authenticated, active tenant and usable Company criteria before SAM access. Every discovery is bounded by page/request/raw-record/time budgets. Public raw page caching is keyed by the exact public query (no credentials); personalized scores and summaries stay in tenant storage. `GET /api/discovery` cannot select another tenant. Structured logs contain only counters/status/timing, not profiles or response bodies. Provider failure preserves prior discovery. Retention prunes old untracked discovery only; tracked evidence/history limits remain unchanged. See OPPORTUNITY_DISCOVERY.md for cache freshness, retries and explicit retention rules.

Audit retention defaults to 90 days (AUDIT_RETENTION_DAYS) and detailed analytics to 90 days (ANALYTICS_RETENTION_DAYS), pruned on new events. Analytics milestone timestamps persist until account deletion. Screening history retains 730 entries per vendor; opportunity changes retain 50 per opportunity. These are engineering limits, not approved legal policies.

Deletion removes logical current data; SQLite free pages/WAL, backups and external providers are not promised immediately erased. Private encrypted backup storage, independent retention and restore-time deletion reapplication are required. Opaque deletion receipts must outlive backups capable of resurrecting the account. Set final retention with human/legal review.

Logout clears the browser cookie, not every copied session; password reset revokes previous session versions. Rate limiting is local and resets on restart. No multi-user roles/invites, distributed abuse control or horizontal writers are supported. Do not upload CUI/export-controlled material or secrets. Matching output is evidence, never a legal eligibility ruling.

## External launch gates

Independently provision/verify uptime alert delivery and offsite restore. Review hosting/provider access, retention, privacy/terms, business/tax and trademark decisions. No Stripe Live activation, paid charge, indexing or approved legal publication is performed by this branch. See COMMERCIAL_OPERATIONS.md, ACCOUNT_LIFECYCLE.md and legal/LAUNCH_LEGAL_CHECKLIST.md.
