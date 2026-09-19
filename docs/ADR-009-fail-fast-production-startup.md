# ADR-009 — Fail-fast production startup and graceful shutdown

Status: accepted for `1.0.0-rc.4`.

## Decision
A production process must refuse to serve traffic unless its critical runtime assumptions are true. The startup preflight reuses the readiness configuration checks and additionally verifies that the data root is writable and the SQLite database passes `PRAGMA quick_check`.

On Railway, if Railway runtime metadata is present, the configured `DATA_ROOT` must equal `RAILWAY_VOLUME_MOUNT_PATH`. This prevents a deployment from silently writing the primary database to ephemeral container storage while a volume exists elsewhere.

The server also handles `SIGTERM`/`SIGINT` by stopping the scheduler, closing the HTTP listener, then closing SQLite. A 10-second hard deadline prevents a deploy from hanging forever.

## Why
`/api/ready` is useful after startup, but a public service should not first start accepting traffic and only then reveal that its persistent volume, live email provider, or production secrets are wrong. Failing fast makes the deployment itself fail and keeps the prior known-good release available for rollback.

## Trade-offs
- Production configuration becomes intentionally strict.
- Railway staging deployments must either satisfy the same live-service requirements or run with a non-production `NODE_ENV`.
- The process remains single-writer by design while SQLite is the source of truth.
