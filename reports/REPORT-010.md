# Project Lantern — Report 010
## Milestone: 1.0.0-rc.1 operational core
Date: 2026-09-18

## Objective
Move Lantern from a multi-tenant local MVP to a low-cost release candidate that can be run as a single-instance SaaS service with durable storage, scheduled operation, email delivery boundaries, backup/recovery artifacts and production readiness checks.

## Decisions made autonomously
1. **SQLite before managed Postgres.** Native Node 22 SQLite was selected for the benchmark launch configuration because it adds transactional persistence and backups with no new package, account or mandatory spend. The tradeoff is explicit: one writable service instance only, and Node currently marks `node:sqlite` experimental.
2. **Durable outbox before direct email from the job.** Daily ingestion writes an idempotent email intent; delivery is a separate retryable process. Email-provider failure therefore cannot erase or block the daily data job.
3. **Resend as first optional sender.** The adapter uses the provider's REST API and an idempotency key. Console delivery remains the zero-cost test path.
4. **Production readiness must fail closed.** `/api/ready` returns failure in production if core secret/cookie/provider/email configuration is unsafe or incomplete.

## Implemented
- SQLite storage manager with WAL, account uniqueness and tenant-document persistence.
- JSON compatibility storage driver retained.
- Persistent account authentication validated across database reopen.
- Tenant data isolation validated in SQLite.
- Shared daily opportunity fetch, per-tenant scoring and idempotent digest queue.
- Feed sync now preserves prior official-description enrichment/compliance work.
- HTML + plain-text digest renderer with escaping.
- Console and Resend email sender adapters.
- Outbox archives successful sends and leaves transient failures retryable.
- Login/register fixed-window rate limiting.
- Forwarded-IP trust only when explicitly enabled.
- Online SQLite backup using Node backup API.
- Backup `PRAGMA integrity_check`, SHA-256 manifest and retention pruning.
- Cleanup of SQLite `-wal/-shm` sidecars after backup verification.
- `/api/health` operational metadata and SAM rotation warning.
- `/api/ready` production configuration checks.
- Dockerfile, Docker ignore rules, deployment schedule and rollback runbook.
- Graceful SIGTERM/SIGINT shutdown.

## QA findings, including failures
### Failure 1 — server did not start after runtime refactor
The first black-box smoke test failed immediately because `resolve()` was used without importing it from `node:path`. Unit tests did not import the full running server and therefore did not catch it. The import was restored and the full suite re-run.

### Apparent failure 2 — 401 after registration
A follow-up smoke attempt returned `401` because the test harness had collided with a previous server process/database and did not obtain a fresh registration cookie. The application session implementation was not the cause. The harness was reset to a fresh data root and process, then the flow was repeated successfully.

### Data-loss risk found before automation
A scheduled feed refresh could have replaced an enriched opportunity with the lighter discovery record, deleting description/requirements. Sync was changed to preserve enrichment and a regression test was added.

### Backup hygiene issue
Backup verification could leave SQLite `-wal/-shm` sidecars. Cleanup and a regression assertion were added before release packaging.

## Black-box HTTP validation
Passed on a fresh SQLite data root:
- `/api/ready` → 200
- account registration → 201
- signed session `/api/auth/me` → 200
- profile save → 200
- opportunity sync → 200, 3 demo records
- ranked opportunity feed → 200
- digest → 200
- health → 200

## Operational-chain validation
Passed on the same tenant:
1. `npm run job:daily` → 1 tenant, 1 digest queued.
2. `npm run outbox:deliver` with console adapter → 1 sent, 0 failed.
3. `npm run backup` → backup created, SHA-256 produced, integrity `ok`.

## Cost state
- Mandatory paid API spend: **$0**.
- Mandatory LLM calls in the critical path: **0**.
- Offline demo external credentials: **0**.
- Human interventions required so far: **1** (obtaining the SAM.gov credential).

## Remaining release gates
- Validate the real SAM credential from an Internet-enabled deployment runtime.
- Select and authorize hosting/persistent storage secret manager.
- Add email verification + password recovery.
- Configure and validate a real sending domain/provider credential.
- Add billing/subscription enforcement.
- Add production error/incident alerting.
- Complete legal/privacy review.
- Replace SQLite with Postgres-class storage before horizontal scaling.

## Benchmark integrity
This report intentionally includes failed smoke attempts and unresolved deployment gates. The release is a candidate, not labeled production-complete.
