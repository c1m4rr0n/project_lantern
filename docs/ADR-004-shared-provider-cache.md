# ADR-004 — Shared upstream opportunity cache
Date: 2026-09-18
Status: accepted

## Problem
SAM.gov opportunity data is largely shared across customers. Calling the upstream API once per customer or browser sync would waste quota, increase latency and make uptime depend too directly on the upstream provider.

## Decision
Wrap the upstream opportunity provider in a process-wide, disk-backed cache with:
- configurable TTL;
- single-flight refresh behavior;
- atomic snapshot writes;
- bounded stale-data fallback when upstream is temporarily unavailable.

## Consequence
Tenant-specific scoring stays separate while raw public opportunity ingestion is reusable. This reduces upstream requests as customer count grows and gives the UI a degraded-but-useful mode during short provider outages.
