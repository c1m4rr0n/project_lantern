# Deployment runbook — Project Lantern 1.0 candidate

Current deployment identity is in CURRENT_DEPLOYMENT.md; source version is in release.json. For source migration, CI, monitoring, optional S3 backup and rollback compatibility, follow [Commercial operations](COMMERCIAL_OPERATIONS.md). Production remains RC16 until separately approved. Historical sections below describe original milestones.

## Runtime shape
Run one Node 22 container with one persistent volume mounted at `/data`. SQLite is intentionally the low-cost initial storage target. **Do not scale the web service horizontally while SQLite is the source of truth.** Move to the future Postgres adapter first.

The web process includes a persistent, single-flight operational scheduler when `SCHEDULER_ENABLED=true`. This is intentional: the daily ingest, email outbox and SQLite backup all need access to the same local volume during the single-instance phase.

## Required production secrets/config
- `SESSION_SECRET`: 32+ random characters, generated directly in the host secret manager.
- `SAM_API_KEY`: inject directly in the host secret manager when `DATA_PROVIDER=sam`.
- `SAM_API_KEY_EXPIRES_AT`: ISO date only; used for rotation warning, never authentication.
- `COOKIE_SECURE=true`.
- `PUBLIC_BASE_URL=https://<production-host>` so account-security links never depend on the request `Host` header.
- `DATA_ROOT=/data` (or the host's explicit persistent-volume path).
- `DATA_PROVIDER=sam` for live opportunity discovery.
- `MARKET_PROVIDER=usaspending` for live award context.
- `EXCLUSION_PROVIDER=sam-extract` for the official Public V2 active-exclusions watch; it reuses `SAM_API_KEY` and caches the shared daily snapshot under `/data/cache/sam-exclusions`.
- `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` for public production because account verification is mandatory.
- `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, and `STRIPE_PRICE_TEAM` for paid production. Production readiness rejects mock billing.
- `SCHEDULER_ENABLED=true` for the selected single-instance launch architecture.
- `TRUST_PROXY=true` only behind a trusted reverse proxy that overwrites forwarded address headers.

## In-process schedules
Recommended initial UTC schedule:
1. scheduler tick every 60 seconds;
2. outbox delivery eligibility every 5 minutes;
3. shared opportunity ingest + one shared exclusions snapshot + per-tenant screening/digest once after 12:00 UTC;
4. verified SQLite backup once after 13:00 UTC;
5. failed daily/backup jobs retry only after the configured retry window.

State is stored at `/data/ops/scheduler-state.json`. Completed daily/backup dates survive process restarts. Email sends are protected by the durable outbox and provider idempotency key.

Billing webhooks are handled at `/api/billing/webhook`; the signed raw request body is verified before state is mutated.

Manual operational commands remain available for incident recovery:
```bash
npm run job:daily
npm run outbox:deliver
npm run backup
npm run doctor:sam
```

## Health
- `/api/health`: liveness and non-secret operational metadata, including scheduler state.
- `/api/ready`: production readiness. It rejects unsafe/incomplete secrets, HTTPS/cookie configuration, selected provider credentials, live email configuration, live billing configuration, scheduler configuration and an implicit/non-persistent data root.

## Release validation
Before deployment:
```bash
npm run check
npm test
npm run smoke:auth
npm run smoke:scheduler
npm run secret-scan
```

After deployment:
1. `/api/ready` must return HTTP 200.
2. `/api/health` must report the expected providers, `schedulerEnabled: true`, and a recent `lastTickAt`.
3. Register/verify a test account using real transactional email.
4. Complete one Stripe test-mode Checkout, verify the webhook moves the tenant to the purchased plan, open the Customer Portal, and cancel/update the subscription to prove entitlement changes.
5. Run a real SAM opportunities sync and one exclusions-extract refresh from the host; confirm no key appears in logs/responses and record the exclusion source date/hash.
6. Confirm a daily digest enters and leaves the outbox once.
7. Confirm a backup manifest reports `integrity: ok` and a SHA-256.

## Rollback
1. Stop/replace the new single instance; do not intentionally run two SQLite writers during rollback.
2. Preserve `/data` before changing binaries.
3. Redeploy the prior Git commit/container image against the same volume if no incompatible schema migration occurred.
4. If restore is needed, replace `lantern.sqlite` only with a backup whose manifest reports `integrity: ok` and whose SHA-256 matches the file.

## Provider choice for benchmark
Railway is the current first-host candidate because its Hobby tier has a low $5 monthly floor and supports volumes mounted to the web service. Render remains viable, but its cron jobs cannot access persistent disks, so it does not remove the need for the same single-process scheduling decision while SQLite remains local.

See `docs/RAILWAY.md` and `docs/ADR-008-in-process-operations-scheduler.md`.

## Production startup contract (RC4)
Lantern now performs a fail-fast startup preflight before binding the HTTP port. A production deployment must not be considered valid merely because the container process exists. It must satisfy the production readiness configuration, write successfully to `DATA_ROOT`, and pass a SQLite quick integrity check.

On Railway, when `RAILWAY_PROJECT_ID` is present, `RAILWAY_VOLUME_MOUNT_PATH` must resolve to exactly the same directory as `DATA_ROOT`. This prevents the primary database from accidentally landing on ephemeral container storage.

During a deploy or restart, Railway sends process termination signals. Lantern stops the in-process scheduler, closes the HTTP listener, closes SQLite and exits `0`; a 10-second deadline forces termination if graceful shutdown stalls.

The repository includes `npm run smoke:lifecycle`, which verifies both failure modes as black-box behavior: unsafe production configuration exits non-zero before readiness, while a valid production-shaped process reaches readiness and exits cleanly on `SIGTERM`.

## Backup boundary
Lantern's automatic SQLite backups currently live on the same persistent volume as the primary database. They protect against logical corruption and bad application changes, but **they are not independent disaster recovery** if the whole volume is lost. For the first live Railway deployment, enable Railway volume backups in addition to Lantern's internal backups. An external/object-storage export remains a later hardening step if the product grows beyond the initial benchmark stage.


## RC8 commercial brand

Set `PRODUCT_NAME=ExcluSignal` in the runtime environment. The internal repository codename remains Project Lantern for benchmark traceability. Public pre-launch pages are intentionally `noindex,nofollow` until the custom-domain launch.


## RC9 billing boundary
Validation plans are intentionally simple: trial = 14 days / 25 vendors, Starter = $39/month / 50 vendors, Team = $99/month / 500 vendors. These are market-validation hypotheses rather than forecasts.

Billing authorization is enforced server-side. An inactive tenant can still authenticate and inspect existing history, but cannot add vendors or screen them. The scheduler also skips inactive tenants before provider work. Stripe secrets remain host-only; Checkout and Customer Portal are hosted by Stripe, and webhook HMAC verification uses the raw body with a bounded timestamp tolerance.
