# Deployment runbook — prepared source RC19

Actual last-verified production identity lives in CURRENT_DEPLOYMENT.md (RC16 tarball bootstrap). Source identity lives in release.json and package.json. This branch prepares migration; it does not perform it.

## Runtime contract

Railway mounts the persistent Railway Volume externally at `/data`. The Dockerfile must not declare a Docker `VOLUME` instruction: Railway rejects it during Docker builds. Keep `DATA_ROOT=/data`, directory creation/ownership, and the `node` runtime user; configure the external mount and verify its writability separately before promotion.

Node 22+, one writable container, persistent /data, SQLite, in-process scheduler. Never intentionally run a second writer or independent cron against this database. Use the Dockerfile with the tracked source; no npm install is needed. npm start remains a supported startup command. Container runs as the node user; verify persistent-volume ownership before promotion.

Required production configuration: NODE_ENV=production, PORT=8787, DATA_ROOT=/data, STORAGE_DRIVER=sqlite, COOKIE_SECURE=true, HTTPS PUBLIC_BASE_URL, strong SESSION_SECRET, SCHEDULER_ENABLED=true, DATA_PROVIDER=sam, EXCLUSION_PROVIDER=sam-extract, MARKET_PROVIDER=usaspending, SAM_API_KEY, EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM, BILLING_PROVIDER=stripe, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER and STRIPE_PRICE_TEAM. Test Stripe credentials can validate lifecycle; do not confuse selecting the stripe adapter with permission to activate Live. TRUST_PROXY is allowed only behind a trusted proxy that overwrites forwarded headers.

Startup checks readiness configuration, writable data root, SQLite integrity and Railway volume-path consistency before listening. SIGTERM/SIGINT stops the scheduler/listener and closes storage. Existing backup/outbox idempotency survives restart.

## Source migration and rollback

Follow the exact checklist in [Commercial operations](COMMERCIAL_OPERATIONS.md): preserve RC16 bootstrap/checksum and verified backup, obtain approval, connect the reviewed source, remove the tarball start override, retain existing volume/domain/configuration, enforce one writer, deploy fresh and verify health release/SHA plus readiness and authenticated flows.

The gate is `npm run release:gate`; also run `git diff --check`. CI uses Node 22 on Linux/Windows and builds Docker on Linux. Do not claim Docker verification if that job has not run.

Rollback must account for RC18 archived vendors: RC16 does not understand archive state and may resume screening them. Use a compatible binary or an explicitly approved verified pre-migration database restore, considering writes since backup. Never silently discard new data.

## Operations

Default schedule: tick every minute, email eligibility every five minutes, daily work after 12:00 UTC, backup after 13:00 UTC, retry window ten minutes. Persistent state is under /data/ops. Manual daily/outbox/backup/reconciliation commands require coordination with the single writer; stop the application before mutating administrative recovery work, especially around account erasure.

Health (/api/health) reports liveness, release and non-secret operational metadata. Readiness (/api/ready) is the deployment/external-monitor endpoint and fails closed on unsafe storage/configuration. Optional offsite failure is separately degraded, not a local-backup failure.

Optional OFFSITE_BACKUP_* configuration, SigV4 path-style compatibility, retry/retention and restore procedure are in COMMERCIAL_OPERATIONS.md. Same-volume backups alone are not disaster recovery. External monitor alert rules are documented there; no provider is provisioned.

## Account and launch controls

SUPPORT_EMAIL is optional. Keep PUBLIC_LAUNCH_ENABLED=false and LEGAL_LINKS_APPROVED=false. Do not expose draft legal documents as approved policies. Future launch requires approved HTTPS canonical/legal URLs; see ACCOUNT_LIFECYCLE.md.

Deletion recovery runs before serving traffic. A failed in-process deletion enters fail-closed recovery mode; repair storage/outbox issues and restart to finish the pending job. Preserve deletion receipts through backup expiry and reapply them when restoring historical data. No changes to Railway, DNS, Stripe Live or repository visibility are part of RC17–RC19 implementation.
