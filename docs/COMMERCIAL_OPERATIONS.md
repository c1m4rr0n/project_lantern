# Commercial hardening operations

## Release discipline and CI

`package.json` and `release.json` must have matching versions; the release identity test is part of `npm run release:gate`. Update current-state docs with each milestone. Runtime commit comes from `GIT_COMMIT_SHA`, falling back to `RAILWAY_GIT_COMMIT_SHA`; no fabricated SHA is reported. Health exposes identity under `operations.release`.

GitHub Actions runs the full gate on Node 22 on Linux and Windows for PRs to main and pushes to main. Linux also builds the Docker image. No npm dependencies/install step are required. Recommend requiring both CI checks and disallowing force pushes to main; configure those rules manually after observing successful runs.

## Future Railway source migration — NOT performed by this branch

1. Obtain approval to promote the reviewed branch. Record effective production release and preserve the RC16 bootstrap command, pinned archive URL and checksum.
2. Produce and verify a SQLite backup; download a separate protected copy before migration. Review schema/data rollback compatibility, especially archived vendors: old RC16 binaries do not understand archival and must not screen migrated data without a compatible restore.
3. Keep the existing service, domain, secrets, one replica and `/data` volume. Connect the approved GitHub source/ref; choose the repository Dockerfile. Remove the custom tarball start command so image `npm start` is used. Do not run a second writer.
4. Keep `/api/ready` as healthcheck, port 8787, `DATA_ROOT=/data`, SQLite and scheduler enabled. Confirm volume permissions allow the image's non-root `node` user. Do not solve permission errors with an ephemeral data root.
5. Create a fresh deployment. Verify health package/release/SHA, startup logs, volume, readiness, authentication, screening, outbox and backups. A green deployment status alone is not proof.
6. Roll back to the previous compatible image/source if needed; restore the verified backup only with the service stopped and an explicit assessment of writes since backup. Never point RC16 at archived-vendor data without restoring compatible state.

## Monitoring

`/api/health` is liveness plus bounded, non-secret status; `/api/ready` gates safe configuration/storage. Optional backup outages degrade operational status, not liveness. Configure any external uptime monitor to GET readiness every 60 seconds, alert after three consecutive 5xx/readiness failures, resolve after two successes. Alert separately when offsite `lastError` is set, unsent copies expire, no success occurs for 26 hours, or scheduler success is overdue. This repository does not provision an alert delivery service.

## Optional S3-compatible backup

Disabled unless `OFFSITE_BACKUP_ENABLED=true`. Configure `OFFSITE_BACKUP_ENDPOINT` (HTTPS, no credentials/query), `OFFSITE_BACKUP_BUCKET`, `OFFSITE_BACKUP_REGION` (`auto` for R2), `OFFSITE_BACKUP_ACCESS_KEY_ID`, `OFFSITE_BACKUP_SECRET_ACCESS_KEY`, optional `OFFSITE_BACKUP_SESSION_TOKEN`, and optional `OFFSITE_BACKUP_PREFIX` (default `exclusignal`). Uses path-style SigV4 requests; choose a compatible regional endpoint for AWS, R2 or B2.

Use a private bucket, least-privilege PUT credentials limited to the backup prefix, provider encryption at rest, independent lifecycle retention and restricted restore access. SQLite backups contain personal/account data and credential hashes: treat the entire backup as sensitive. No credentials are emitted in logs. No bucket is created by this code.

Only integrity-checked/checksummed SQLite files are uploaded, followed by their manifests. Object names remain stable across retries; a manifest marks a completed pair. Scheduler retries with bounded exponential backoff after restart. Local backups still succeed during remote failure. Local retention remains bounded; `expiredUnsent` explicitly records missed copies. Configure bucket retention separately and perform a restore drill: download pair, verify SHA-256 and integrity, stop the writer, restore, reapply account-deletion records, then validate readiness.

## Audit retention

Security events contain action, time, opaque IDs only, never passwords/tokens/cookies/auth links. Default audit retention is 90 days (`AUDIT_RETENTION_DAYS`); pruning occurs on append. This is an engineering default, not an approved legal retention policy. Restrict database and backup access. Account deletion and backup-retention boundaries must be reflected in reviewed legal materials.
