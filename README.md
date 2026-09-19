
# ExcluSignal — commercial hardening

Source identity lives in `release.json` and `package.json`. Production remains RC16 until an explicitly approved migration. Vendor Exclusion Watch is primary; Pursuit Watch is secondary.

## CI status and release gate

GitHub Actions runs Node 22 on Linux and Windows for PRs to main and pushes to main. A configured workflow is not a claim of a successful hosted run. Run `npm run release:gate` before every milestone commit. No npm install is required. See [commercial operations](docs/COMMERCIAL_OPERATIONS.md) for source migration, monitoring, optional offsite backups and audit retention.

## Historical commercial identity (RC10)

- **Public product name:** ExcluSignal
- **Internal benchmark codename:** Project Lantern
- **Positioning:** Federal vendor exclusion monitoring with evidence.
- **Primary wedge:** continuously screen vendor/subcontractor rosters against official SAM.gov active exclusions, preserve snapshot/match evidence, and alert on status changes.
- **Private-beta indexing:** public HTML remains intentionally `noindex,nofollow` while the custom domain is used for controlled testing.
- **Domain:** `exclusignal.com` is registered and attached to Railway through Cloudflare. Registration does not constitute trademark clearance.

# Project Lantern — 1.0.0-rc.10 (commercial brand: ExcluSignal)

Project Lantern is the internal benchmark codename. The commercial product name is **ExcluSignal**, a low-cost, multi-tenant federal vendor-risk and procurement intelligence SaaS candidate. RC10 hardens the paid-beta experience after a real hosted lifecycle test: immediate verification/reset email delivery with durable retry, Vendor Watch-first onboarding, removal of demo seed opportunities from live SAM tenants, clearer profile validation, scheduled-cancellation visibility, and customer-facing release-label cleanup. Vendor Exclusion Watch remains the primary wedge; opportunity and Pursuit Change Intelligence remain a secondary module.

## Product thesis
Lantern does not try to replace the entire government-contracting stack. The RC10 product wedge is **Vendor Exclusion Watch**: continuously compare a contractor's vendor/subcontractor roster with the official active SAM.gov exclusions extract using UEI, CAGE and conservative legal-name matching. Exact identifiers produce stronger identity evidence; name-only matches remain review-required. **Pursuit Change Intelligence** stays as an included secondary workflow.

## Run locally
Node 22+ is required.

```bash
npm start
# open http://localhost:8787
```

`npm start` uses Node's native `--env-file-if-exists=.env` support. The repository contains only `.env.example`; real secrets must stay outside Git.

## Quality gate
```bash
npm test
npm run check
npm run secret-scan
npm run smoke:auth
npm run smoke:vendor-watch
npm run smoke:billing
npm run smoke:change-watch
npm run smoke:requirement-delta
npm run smoke:scheduler
npm run smoke:production
npm run smoke:lifecycle
```

Current release candidate: **87 automated tests** plus reusable black-box auth, Vendor Watch, Billing, Change Watch, Requirement Delta, scheduler, production-readiness and process-lifecycle smoke tests. Vendor Watch proves add → screen → evidence → alert → acknowledge → digest over HTTP; Billing proves trial entitlements and server-side limits; the lifecycle smoke proves unsafe production configuration fails before serving traffic and a valid process exits cleanly on `SIGTERM`.

## Provider modes
- Offline/demo: `DATA_PROVIDER=mock` — no external account required.
- Live discovery: `DATA_PROVIDER=sam` + `SAM_API_KEY` — official SAM.gov Opportunities v2 API.
- Live vendor screening: `EXCLUSION_PROVIDER=sam-extract` + the same `SAM_API_KEY` — official SAM.gov Public V2 active-exclusions daily extract.
- Offline vendor screening: `EXCLUSION_PROVIDER=mock`.
- Historical market context: `MARKET_PROVIDER=usaspending` — USAspending award-search API.
- Email preview: `EMAIL_PROVIDER=console` — no external account.
- Transactional email: `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`.
- Billing preview: `BILLING_PROVIDER=mock` — trial/entitlement logic runs without charging.
- Live billing: `BILLING_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PRICE_STARTER` + `STRIPE_PRICE_TEAM`.


## Billing and entitlements
RC9 introduces the first server-enforced commercialization boundary. New accounts receive a **14-day trial** with up to **25 watched vendors**. Validation pricing is **Starter $39/month for 50 vendors** and **Team $99/month for 500 vendors**. These prices are hypotheses for market validation, not revenue forecasts.

Expired trials/subscriptions remain able to authenticate and read existing history, but new vendor creation and screenings are blocked server-side. Daily automation also skips tenants without an active entitlement before making upstream provider calls. Stripe is isolated behind a provider adapter: Checkout and Customer Portal are hosted by Stripe, and webhook signatures are verified against the raw request body with replay tolerance. Production readiness deliberately rejects `BILLING_PROVIDER=mock`.

## Storage
The 1.0 candidate defaults to `STORAGE_DRIVER=sqlite` using Node 22's native SQLite module. It enables WAL mode, transactional writes, uniqueness constraints and verified backups without adding npm dependencies.

This is intentionally a **single writable instance** launch configuration. Do not horizontally scale the web service while SQLite is the source of truth. The domain/services are isolated behind a storage manager so a Postgres-class adapter can replace it before scale-out.

The prior JSON storage driver remains available as `STORAGE_DRIVER=json` for compatibility/testing.

## Core loop
Verified account → vendor roster (legal name + UEI/CAGE) → shared daily active-exclusions snapshot → deterministic identity match → screening evidence/history → status-change alert → combined daily brief. Secondary loop: company profile → shared opportunity ingest/cache → deterministic score/rank → pursuit decision → Change Watch + Requirement Delta + fit impact.

## Operational commands
```bash
npm run job:daily        # shared ingest, per-tenant scoring, idempotent digest enqueue
npm run outbox:deliver   # console preview or Resend delivery; success is archived
npm run backup           # SQLite online backup + integrity check + SHA-256 + retention
npm run doctor:sam       # live SAM credential/connectivity diagnostic without printing key
```

Operational metadata appears in `/api/health`. `/api/ready` returns 503 if selected production configuration is unsafe/incomplete. In the single-instance SQLite launch, `SCHEDULER_ENABLED=true` runs digest, outbox delivery and backup inside the web process so all recurring work shares the same persistent volume.

## Security choices implemented
- Scrypt password hashing with per-password salt.
- Signed HTTP-only sessions checked against a server-side session version.
- Verified-email gate before workspace access.
- One-time email-verification and password-reset tokens; only token hashes are stored.
- Password reset increments the session version and revokes older cookies.
- Tenant isolation and path-traversal rejection.
- Request body limits and security headers.
- Server-only SAM credentials and strict SAM host allowlist for enrichment URLs.
- Auth rate limiting; forwarded IP headers are ignored unless `TRUST_PROXY=true` is explicitly configured.
- Secret scanner for tracked plus untracked non-ignored repository content.
- Production readiness rejects missing `SESSION_SECRET`, insecure cookie configuration, a missing HTTPS `PUBLIC_BASE_URL`, missing selected-provider credentials, or incomplete Resend settings.
- Production startup is fail-fast: `DATA_ROOT` must be writable, SQLite must pass `PRAGMA quick_check`, and Railway volume metadata must match `DATA_ROOT` when present.

## Reliability choices implemented
- Shared opportunity cache with TTL, single-flight refresh and bounded stale fallback.
- Shared SAM.gov exclusion-extract cache: one daily Public V2 snapshot can screen every tenant roster; only `Firm` records are retained in the normalized screening index.
- Vendor identity matching prioritizes exact UEI/CAGE. Name-only matches are surfaced as `possible-match` rather than automatically asserted as the same entity.
- Vendor screening history stores timestamp, match method, source file/date/hash and evidence, with explicit acknowledgement for alerts.
- Shared SAM-description cache.
- Feed refresh preserves existing enrichment/compliance rows rather than deleting local review work.
- Idempotent daily digest files keyed by tenant/date.
- Separate outbox delivery so an email outage does not break ingestion.
- Successful emails archived; transient delivery failures stay retryable.
- Verification/reset outbox payloads are redacted after successful delivery so archived mail records do not retain usable tokens.
- Daily automation skips unverified/unconfigured tenants before calling the upstream opportunity provider.
- SQLite backups receive `PRAGMA integrity_check` and SHA-256 manifests with retention pruning.
- Graceful SIGTERM/SIGINT shutdown.
- Persistent in-process scheduler state prevents completed daily/backup tasks from duplicating after restart; failed jobs back off before retry.
- Opportunities marked `reviewing` or `pursue` survive the rolling discovery window and are refreshed directly by SAM notice ID.
- Change Watch fingerprints material public fields and records only meaningful deltas, avoiding duplicate events and ignoring array-order noise.
- Requirement Delta compares versioned obligation candidates, detects added/removed/modified language and maps explicit company hard-blocker phrases to source evidence.
- The first tracked analysis becomes a silent baseline; later requirement changes become auditable events.
- Metadata-change events force a fresh SAM description retrieval while ordinary tracked checks reuse the shared detail cache.

## Why the critical path is deterministic
The current release uses no LLM in vendor screening, scoring or requirement extraction. This keeps marginal model cost at zero, makes tests reproducible and makes recommendations inspectable. Requirement extraction searches official notice text for obligation/submission language and labels output as candidates requiring human review.

## Milestones
### 0.1–0.5
- Runnable zero-dependency Node core.
- Deterministic opportunity scoring.
- SAM.gov and USAspending adapters.
- Morning digest and self-service onboarding.
- Atomic local persistence and HTTP hardening.

### 0.6–0.8
- Registration/login/logout.
- Scrypt password hashing and signed sessions.
- Tenant isolation.
- Shared upstream cache.
- Pursuit workflow and internal notes.

### 0.9
- SAM schema normalization and on-demand official-description enrichment.
- Allowlisted server-only description retrieval and shared detail cache.
- Auditable requirement candidates and non-destructive compliance enrichment.
- SAM key-expiry visibility and credential doctor.
- 22 tests.

### 1.0.0-rc.1
- Native SQLite transactional storage behind a driver abstraction.
- Persistent multi-tenant auth/data verified across reopen.
- Daily idempotent automation job.
- Durable email outbox and Resend REST adapter with provider idempotency key.
- Verified SQLite backup/retention pipeline.
- Login/register rate limiting.
- Operational health/readiness.
- Docker packaging and deployment/rollback runbook.
- Feed-sync enrichment preservation regression fix.
- 32 automated tests.
- Black-box HTTP and full operational-chain smoke tests passed after two pre-release issues were detected and corrected/documented.


### 1.0.0-rc.2
- Mandatory email verification before workspace access.
- One-time hashed verification/reset tokens with expiry and token rotation.
- Password reset verifies possession of the email and revokes all older signed sessions via `sessionVersion`.
- Generic password-reset/resend responses to reduce account enumeration.
- Verification/reset email templates and durable outbox queueing.
- Sensitive auth-email payloads redacted after successful delivery.
- Daily job performs zero upstream calls when no verified configured tenant is eligible.
- Reusable `npm run smoke:auth` black-box validation.
- 38 automated tests plus passing auth smoke test.

### 1.0.0-rc.3
- In-process single-flight scheduler for the single-instance SQLite deployment.
- Persistent scheduler state with restart-safe daily/backup idempotency and retry backoff.
- Scheduler-driven daily digest, outbox delivery and verified backups.
- Scheduler status exposed through `/api/health`.
- Black-box `npm run smoke:scheduler` validates daily work → email → backup → process restart without duplication.
- Partial email delivery marks the operational tick unhealthy instead of reporting a false success.
- Railway-first deployment checklist for one service + one persistent volume; no external cron service while SQLite is local.
- 44 automated tests plus passing auth, scheduler and production-readiness smoke tests.

### 1.0.0-rc.4
- Fail-fast production startup before binding the HTTP port.
- Startup verifies writable `DATA_ROOT` and SQLite `PRAGMA quick_check`.
- Railway deployments with runtime metadata require `RAILWAY_VOLUME_MOUNT_PATH` to match `DATA_ROOT`, preventing accidental writes to ephemeral storage.
- Graceful `SIGTERM`/`SIGINT` shutdown stops scheduler, closes HTTP and then closes SQLite, with a bounded forced-exit deadline.
- `/api/health` exposes non-secret deployment metadata and startup-preflight state.
- Black-box `npm run smoke:lifecycle` proves unsafe production configuration exits non-zero and a valid production-shaped process exits `0` after `SIGTERM`.
- Deployment docs now explicitly avoid Railway's deprecated legacy Config-as-Code format for new services and record the boundary between same-volume backups and independent disaster recovery.
- 47 automated tests plus passing auth, scheduler, production-readiness and lifecycle smoke tests.

### 1.0.0-rc.5
- Change Watch for opportunities marked `reviewing` or `pursue`.
- Tracked opportunities are retained even after they leave the short rolling discovery window.
- SAM watch adapter refreshes tracked notices directly by `noticeid` using a narrow mandatory posted-date range and shared cache.
- Material fingerprints cover deadline, title, solicitation/type, agency, set-aside, PSC, NAICS, active state, place of performance and public resource links.
- Change events are deduplicated, tenant-isolated and explicitly acknowledgeable.
- Daily digest and opportunity UI surface unread tracked-pursuit changes.
- New `GET /api/opportunities/:id/changes` and `POST /api/opportunities/:id/changes/ack` endpoints.
- Black-box `npm run smoke:change-watch` proves unread → acknowledge → cleared workflow over HTTP.
- 55 automated tests plus passing auth, Change Watch, scheduler, production-readiness and lifecycle smoke tests.

### 1.0.0-rc.6
- Product positioning shifted from generic opportunity matching toward **Pursuit Change Intelligence** after competitive overlap was identified.
- Requirement Delta deterministically separates added, removed and modified obligation candidates from official SAM.gov description text.
- Company profiles can define explicit `hardBlockers`; matching added/modified source text can force a transparent `skip` result.
- Every tracked change event can include fit impact: score before/after, recommendation before/after, new risks and resolved risks.
- First tracked description analysis establishes a baseline without a false amendment alert.
- Daily scheduler now passes the shared SAM detail provider, so requirement checks happen automatically rather than only through manual UI enrichment.
- Daily digest surfaces requirement counts, blockers and score movement.
- New black-box `smoke:requirement-delta` validates the blocker + fit-impact payload through HTTP and digest boundaries.
- 61 automated tests; all six smoke flows and secret scan pass.


### 1.0.0-rc.7
- Strategic wedge pivot from crowded amendment-intelligence positioning to **Vendor Exclusion Watch**, while preserving RC6 pursuit functionality.
- Official SAM.gov Public V2 exclusion-extract provider with shared daily cache, bounded stale fallback, ZIP/CSV parsing and source-file SHA-256.
- Normalized Firm-only screening index with conservative identity rules: exact UEI/CAGE = high-confidence active-exclusion signal; legal-name-only = possible match requiring review.
- Multi-tenant vendor roster and screening-history storage in both SQLite and JSON drivers.
- Vendor Watch API/UI: add/update/remove vendor, screen one/all, evidence, unread alert count and acknowledgement.
- Daily automation supports vendor-only tenants without calling the opportunities feed; all vendor tenants share one exclusion snapshot refresh.
- Daily digest/email now surfaces active-exclusion and possible-match alerts with an explicit non-legal-determination boundary.
- New black-box `smoke:vendor-watch` validates register → verify → add vendor → screen → evidence → acknowledge → digest.
- 69 automated tests before final RC8 gate; existing auth, opportunity, Requirement Delta, scheduler, backup and readiness suites remained green.

### 1.0.0-rc.8
- Commercial brand switched to **ExcluSignal** while Project Lantern remains the internal benchmark codename.
- Public UI, auth email, daily digest and provider User-Agent strings use the runtime-configurable product name.
- Public pre-launch pages use `noindex,nofollow` until controlled custom-domain launch.
- 71 automated tests and seven smoke flows passed.

### 1.0.0-rc.9
- Added 14-day trial and server-side entitlements.
- Trial limit: 25 watched vendors; Starter validation plan: $39/month for 50; Team: $99/month for 500.
- Expired/inactive tenants become read-only for vendor creation and screening rather than losing access to history.
- Scheduler skips ineligible tenants before upstream work, avoiding waste.
- Zero-dependency Stripe adapter supports hosted subscription Checkout, Customer Portal and raw-body webhook signature verification.
- Production readiness now requires live Stripe billing in addition to live email.
- Billing smoke covers trial state, vendor limit and the mock-to-live boundary.

### 1.0.0-rc.10
- Auth verification and password-reset email attempt immediate Resend delivery while retaining the durable outbox for retry.
- Outbox delivery uses a single-instance in-memory claim so scheduler and request-path delivery cannot send the same queued file concurrently.
- Verified/login/reset flows land on Vendor Watch; Pursuit Watch company profile is optional.
- Onboarding reports actionable validation errors instead of a generic “Could not save”.
- Live SAM tenants hide and purge internal DEMO opportunity fixtures.
- Public UI replaces internal RC labels with Beta, adds a favicon, and surfaces cancel-at-period-end dates.
- 87 automated tests before final release gate.

## Hosted validation achieved
Railway runs ExcluSignal as a single writable instance with a persistent `/data` volume. Hosted checks have validated SAM.gov Opportunities, the official active-exclusions extract, checksum-verified runtime startup, and `/api/ready`. The custom domain `https://exclusignal.com` is attached through Cloudflare. Resend delivered a real transactional test with HTTP `200`. Stripe sandbox validated hosted Checkout, signed webhook activation of Starter, Customer Portal, and cancel-at-period-end with clean HTTP `200` delivery after a duplicate webhook destination was removed.

No real card has been charged and no MRR is claimed. `customer.subscription.deleted` remains unobserved because the sandbox subscription was scheduled to end at the close of its billing period rather than canceled immediately.

## Secrets and SAM.gov
Never commit a SAM.gov API key. Production should inject it directly through the deployment platform's secret manager. The benchmark received an individual key once; it was never committed and was scrubbed from workspace files after connectivity testing.

## Remaining gates before paid public beta
The release candidate is running on real infrastructure, but it is **not represented as finished production SaaS**. Remaining gates include:
- activate and verify Stripe **live mode** only after business/tax setup is decided;
- privacy/terms/legal and Puerto Rico tax review before real charges;
- production error monitoring/incident alert delivery;
- observe or explicitly test the final `customer.subscription.deleted` lifecycle;
- a durable source/deploy pipeline instead of the temporary checksum-verified runtime tarball bootstrap;
- independent disaster-recovery backup policy for the persistent volume;
- formal trademark review for ExcluSignal;
- Postgres-class storage before horizontal scaling or multi-region writes;
- most importantly, prove willingness to pay with a real external customer.

See `docs/DEPLOYMENT.md` for the deployment and rollback runbook.
