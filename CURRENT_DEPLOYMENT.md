# ExcluSignal — Current Deployment and Operations Handoff

## Current production release

- Release: `1.0.0-rc.13`
- Public domain: `https://exclusignal.com`
- GitHub repository: `c1m4rr0n/project_lantern`
- Public GitHub `main` head at handoff: `38b483cb7cab24045b11887c0680c7f9bdebcfc7`
- Commit message: `Add ExcluSignal RC13 runtime`
- Runtime artifact: `lantern-runtime-rc13.tar.gz`
- Runtime SHA-256: `ccc76e2ea030db71ef787bd1691e2defd73ec95b705dfbdda4e26b9e26ef19d1`

## Railway shape

- Project name: `project-lantern`
- Service: `lantern-web`
- Base image currently used: `node:22-bookworm-slim`
- Application port: `8787`
- Persistent volume: `lantern-data` mounted at `/data`
- Health/readiness endpoint: `/api/ready`
- Public health metadata endpoint: `/api/health`
- Current topology: one writable replica + SQLite + in-process scheduler.

Do not add additional writable replicas while SQLite is authoritative.

## Temporary deployment mechanism

Production currently starts by downloading a runtime tarball from GitHub, verifying its SHA-256, extracting it under `/tmp/lantern-app`, and executing `node server.js`.

That is intentionally temporary. The next infrastructure milestone is to deploy tracked source directly from GitHub after source restoration is merged and validated.

## Railway operational lesson

During RC13 promotion, changing the configured start command and then using Railway `redeploy` produced a green deployment that still executed the old RC12 snapshot. The log exposed the problem because it printed the RC12 checksum.

A fresh deployment was then forced and the startup log verified the expected RC13 checksum.

**Rule:** after changing runtime source/config, never infer the effective release from `SUCCESS` alone. Confirm the expected checksum/version in logs.

## Known rollback

Previous known-good runtime:

- `lantern-runtime-rc12.tar.gz`
- SHA-256: `40cacd00c51cbc90b084a93e96413125ab7d3be991c95eb5bdcde9fa3b491d6c`

Rollback should restore the corresponding start command/checksum and trigger a genuinely new deployment, then verify the old checksum in logs and `/api/ready`.

## Important configuration names

Values are intentionally not documented here. Keep them in the host secret/configuration store.

Runtime/operations include names such as:

- `NODE_ENV`
- `PORT`
- `PUBLIC_BASE_URL`
- `PRODUCT_NAME`
- `DATA_ROOT`
- `STORAGE_DRIVER`
- `SCHEDULER_ENABLED`
- scheduler/email/backup interval settings
- `SESSION_SECRET`
- cookie/proxy security settings
- `DATA_PROVIDER`
- `MARKET_PROVIDER`
- `SAM_API_KEY`
- `SAM_API_KEY_EXPIRES_AT`
- `SAM_LOOKBACK_DAYS`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `BILLING_PROVIDER`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_TEAM`

Never print or commit secret values.

## Data durability boundaries

- `/data` is the authoritative persistent runtime location for the current SQLite deployment.
- Application-level SQLite backups protect against some logical/application corruption.
- Backups stored on the same underlying volume are **not** independent disaster recovery against volume loss.
- Independent/off-volume backup remains a production-readiness improvement.

## Production validation checklist

After any release promotion:

1. deployment reaches `SUCCESS`;
2. startup logs show the intended release checksum/version;
3. persistent volume is mounted;
4. server logs identify expected providers/storage/scheduler;
5. `/api/ready` returns 200;
6. landing page returns 200;
7. authenticated session flow works;
8. `/api/vendors`, `/api/billing/status`, `/api/auth/me`, `/api/health` behave as expected;
9. inspect errors/5xx before calling the release complete;
10. retain prior runtime for rollback until post-deploy validation completes.
