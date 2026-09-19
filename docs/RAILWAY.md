# Railway deployment checklist — Project Lantern 1.0 candidate

This is the preferred first-host checklist for the benchmark as of 2026-09-18. It deliberately deploys **one persistent web service**, not separate Railway cron services, while SQLite is the source of truth.

## Why Railway for the first live deployment
- Hobby currently has a $5/month minimum with $5 included usage.
- Hobby supports persistent volumes (5 GB default limit).
- A volume can be mounted directly into the service at `/data`.
- Health checks and restart policies are built into the service platform.

Official references:
- https://docs.railway.com/pricing
- https://docs.railway.com/pricing/plans
- https://docs.railway.com/volumes
- https://docs.railway.com/deployments/restart-policy

Pricing is external and can change; re-check it at the actual deployment date.

## Service shape
- Source: Git repository or uploaded container source.
- Runtime: Dockerfile already included in this repository.
- Replicas: **1**.
- Persistent volume: mount at `/data`.
- Healthcheck path: `/api/ready`.
- Restart policy: `On Failure` is acceptable initially; `Always` is also reasonable on a paid plan.
- Do not configure a Railway cron service for Lantern while using local SQLite.

## Required variables for live production
Set these in Railway's variable/secret UI. Never commit them.

```text
NODE_ENV=production
DATA_ROOT=/data
STORAGE_DRIVER=sqlite
DATA_PROVIDER=sam
MARKET_PROVIDER=usaspending
SCHEDULER_ENABLED=true
COOKIE_SECURE=true
TRUST_PROXY=true
PUBLIC_BASE_URL=https://<your-public-host>
SESSION_SECRET=<32+ random characters>
SAM_API_KEY=<secret>
SAM_API_KEY_EXPIRES_AT=<YYYY-MM-DD>
EMAIL_PROVIDER=resend
RESEND_API_KEY=<secret>
EMAIL_FROM=<verified sender>
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=<secret>
STRIPE_WEBHOOK_SECRET=<secret>
STRIPE_PRICE_STARTER=<price id>
STRIPE_PRICE_TEAM=<price id>
PRODUCT_NAME=ExcluSignal
RAILWAY_RUN_UID=0
```

Recommended initial scheduler settings:

```text
SCHEDULER_INTERVAL_MS=60000
DAILY_JOB_HOUR_UTC=12
BACKUP_HOUR_UTC=13
EMAIL_DELIVERY_INTERVAL_MS=300000
SCHEDULER_RETRY_MS=600000
BACKUP_RETENTION_COUNT=7
EMAIL_BATCH_LIMIT=100
```

## Deployment sequence
1. Create a Railway project and one service from this repository.
2. Attach a volume to that service at `/data`.
3. Configure all non-secret variables.
4. Generate `SESSION_SECRET` directly in the hosting environment or another secure local mechanism; do not send it through chat.
5. Set `RAILWAY_RUN_UID=0` for this initial Docker deployment because Railway documents volume mounts as root-owned while the image declares a non-root runtime user. This is a host-specific launch compromise and should be replaced by a least-privilege volume-permission bootstrap if Railway becomes permanent.
6. Insert the existing SAM.gov key directly into Railway's secret UI.
7. Add Resend only after its sending domain is verified; until then use a non-production staging deployment rather than claiming public readiness.
8. Create Stripe test-mode Starter/Team recurring prices, set Stripe secrets/price IDs, and configure a webhook for `/api/billing/webhook`. Keep the deployment in staging until one full test-mode subscription lifecycle passes.
9. Generate a public Railway domain (or attach a custom domain), then set that exact HTTPS origin as `PUBLIC_BASE_URL`.
10. Deploy one replica.
11. Confirm `/api/ready` returns `200` and every check is true.
12. Confirm `/api/health` reports `schedulerEnabled: true` and a recent scheduler tick.
13. Register a real test account, verify it from delivered email, configure a profile, and verify one real SAM sync.
14. Confirm the next operational cycle creates a digest and a backup whose integrity is `ok`.

## Rollback
- Keep the persistent volume attached.
- Roll the service image/source back to the prior known-good Git commit.
- If a data restore is required, use only a backup manifest with `integrity: ok` and a matching SHA-256.
- Do not run two rollback/forward replicas concurrently against the same SQLite file.

## Upgrade trigger
Move to Postgres + a dedicated worker/scheduler before any of these become true:
- more than one writable web replica is required;
- deployments need overlap/zero-downtime writers;
- job execution must continue independently of web availability;
- data volume/concurrency produces measurable SQLite contention;
- regional/multi-service access becomes necessary.

## RC4 startup behavior
Beginning with `1.0.0-rc.4`, production startup is fail-fast. Before binding the HTTP port Lantern verifies:
- the same critical settings enforced by `/api/ready`;
- `DATA_ROOT` is readable and writable;
- SQLite passes `PRAGMA quick_check`;
- when Railway metadata is present, `RAILWAY_VOLUME_MOUNT_PATH` resolves to the same path as `DATA_ROOT`.

A mismatch exits the process instead of starting an apparently healthy service on ephemeral storage. Railway should therefore keep the previous deployment available until the new deployment passes its health check.

Lantern also handles `SIGTERM` and `SIGINT` by stopping its in-process scheduler, closing the HTTP listener and then closing SQLite, with a 10-second forced-exit deadline.

### Railway configuration note (September 2026)
Railway's legacy `railway.toml` / `railway.json` Config as Code is deprecated for new services. Do not add a new legacy config file to this repository. Use Railway's current Infrastructure as Code flow (`railway config init`, producing `.railway/railway.ts`) after the real project exists, or configure the first service through the Railway integration/dashboard and then import that state. This avoids baking an already-deprecated deployment format into the benchmark artifact.


## RC8 commercial brand

Set `PRODUCT_NAME=ExcluSignal` in the runtime environment. The internal repository codename remains Project Lantern for benchmark traceability. Public pre-launch pages are intentionally `noindex,nofollow` until the custom-domain launch.


## RC9 billing launch gate
Railway production readiness now requires `BILLING_PROVIDER=stripe` and all four Stripe configuration values. A `mock` billing provider is valid for local/staging validation but deliberately fails production startup. This prevents a public instance from looking production-ready while all users still bypass payment.
