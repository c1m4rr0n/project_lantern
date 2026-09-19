# ADR-008 — In-process operations scheduler for the single-instance SQLite launch

**Date:** 2026-09-18
**Status:** accepted for the 1.0 launch architecture

## Context
Lantern's first deployable shape uses a single writable SQLite database on a persistent volume. Splitting the daily ingest, outbox delivery and backup into separate hosted cron services would either require a shared database service or create unsafe/unsupported access patterns to the web service's local persistent disk.

Current hosting research reinforces that tradeoff:
- Railway cron jobs execute as scheduled services, while persistent volumes are mounted to individual services.
- Render cron jobs cannot provision or access a persistent disk.

Official references checked 2026-09-18:
- https://docs.railway.com/cron-jobs
- https://docs.railway.com/volumes
- https://render.com/docs/cronjobs
- https://render.com/docs/disks

## Decision
Run a small operational scheduler **inside the single Lantern web process** while SQLite is the source of truth.

The scheduler owns three recurring tasks:
1. shared opportunity ingest + per-tenant daily digest enqueue;
2. frequent outbox delivery/retry;
3. daily verified SQLite backup with retention.

Scheduler state is written atomically to the same persistent volume. Daily and backup tasks record their completed UTC date so a process restart does not repeat already completed work. Failed daily/backup work respects a retry window. The scheduler is single-flight inside the process.

## Why this wins for the benchmark
- one service instead of web + worker + cron infrastructure;
- one volume and one SQLite writer boundary;
- no queue/database vendor required yet;
- lower mandatory spend and fewer human setup steps;
- deterministic offline tests and a restart-idempotency smoke test;
- preserves a clean upgrade path: once storage moves to Postgres, scheduled workers can be separated safely.

## Limits
- Run **exactly one** writable Lantern replica in SQLite mode.
- In-process schedules are not minute-precise and pause while the service is offline.
- Persistent scheduler state prevents duplicate daily work after ordinary restarts, but it is not a distributed lease.
- Before horizontal scaling, move durable state to Postgres-class storage and then move recurring work to a dedicated worker/scheduler or queue.
