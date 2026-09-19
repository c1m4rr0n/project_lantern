# Project Lantern — Report 012
## Milestone: 1.0.0-rc.3 single-service operations scheduler
Date: 2026-09-18

## Objective
Make the low-cost SQLite launch architecture operational on a real persistent web service without adding a second worker, cron service, queue or managed database solely to run recurring tasks.

## Hosting research that changed the implementation
The initial deployment plan assumed the existing CLI jobs could simply become hosted cron jobs. Fresh review of official hosting documentation showed that this is unsafe or unavailable with a local SQLite volume:

- Railway cron jobs are scheduled services expected to run and exit; Railway volumes are mounted to a service.
- Render explicitly states that cron jobs cannot provision or access a persistent disk.
- Railway Hobby is currently $5/month with $5 included usage and supports a 5 GB default volume limit.
- Resend's current free transactional tier is $0/month for 3,000 emails/month with a 100/day limit.

Official references checked 2026-09-18:
- https://docs.railway.com/pricing
- https://docs.railway.com/pricing/plans
- https://docs.railway.com/volumes
- https://docs.railway.com/cron-jobs
- https://render.com/docs/cronjobs
- https://render.com/docs/disks
- https://resend.com/pricing

External prices/limits are not treated as permanent facts; they must be rechecked at deployment.

## Autonomous decision
Keep **one writable service + one persistent volume + SQLite** for the first live benchmark deployment and run operational scheduling inside that web process.

This minimizes:
- services to configure;
- monthly platform floor;
- secret/account setup;
- cross-process database coordination;
- failure modes the benchmark cannot yet justify.

It deliberately sacrifices horizontal scale and scheduler independence. Those become upgrade triggers for Postgres + dedicated worker infrastructure later.

## Implemented
- `src/ops/in-process-scheduler.js`.
- Single-flight in-process scheduler loop.
- Persistent `/ops/scheduler-state.json`.
- Daily digest idempotency survives process restart.
- Daily backup idempotency survives process restart.
- Retry/backoff state for failed daily/backup tasks.
- Configurable email-delivery interval and batch size.
- Partial email delivery marks a tick unhealthy.
- Scheduler state surfaced by `/api/health`.
- Scheduler can be enabled/disabled with `SCHEDULER_ENABLED`.
- Explicit Railway deployment checklist with one service and `/data` volume.
- ADR documenting why hosted cron is intentionally deferred.

## Automated QA
Unit/integration suite: **44/44 passing**.

New coverage proves:
1. daily and backup tasks run once per UTC day;
2. persisted state prevents duplicate daily/backup work after a restart;
3. failed daily work backs off and retries after the configured window;
4. partial email delivery is reflected as an unhealthy operational tick;
5. production readiness accepts the intended live single-service configuration and rejects development-only email, insecure cookies and a disabled scheduler.

## Black-box scheduler smoke
A temporary SQLite deployment was seeded with one verified/configured tenant. The actual HTTP server was started with the scheduler enabled.

Observed chain:
`server start → scheduler tick → daily ingest/digest → outbox send → SQLite backup → integrity ok`

The process was then stopped and started again against the same persistent directory. The second process did **not** duplicate:
- the daily job completion;
- the sent digest;
- the backup.

A second production-readiness smoke test also proved that the intended production configuration returns `200`, while a deliberately unsafe configuration returns `503`.

Smoke result:
- scheduler enabled: yes;
- email sent: 1;
- backup integrity: `ok`;
- restart idempotent: yes;
- backup files after restart: 1.

## Cost state
Mandatory application/API spend remains **$0** in offline/demo mode. A first live Railway Hobby deployment has a current platform floor of approximately **$5/month**, subject to Railway's current pricing and actual resource usage. Resend can start on its current free tier if the sending volume stays within published limits.

These are current provider prices, not a revenue forecast.

## Human intervention count
Still **1** so far: the user obtained the SAM.gov API credential. No new human account was required to implement or validate RC3 locally.

## Next unavoidable human gate
The next meaningful step is an internet-enabled deployment. That requires the owner to authorize/create the hosting account and place secrets directly in the host's secret manager. ChatGPT can continue to decide configuration and provide exact values/instructions, but should not receive or commit the SAM key again.

## Remaining gates after hosting authorization
- live SAM authentication from the deployed runtime;
- verified transactional email domain + live delivery;
- external uptime/error alerting;
- billing/subscription enforcement;
- legal/privacy/terms review before paid public beta.
