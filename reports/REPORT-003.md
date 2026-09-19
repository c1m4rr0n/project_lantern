# Committee Report 003 — Retention loop
Date: 2026-09-18

## Problem addressed
A discovery tool that requires users to remember to log in will churn. The product must push visible value on a recurring cadence.

## Decision
Build the morning digest before email infrastructure. This separates product logic from a vendor account and lets the committee inspect the exact value artifact without credentials.

## Implemented
- Digest API summarizing scanned opportunities, strong matches and deadlines inside 14 days.
- Top-match reasons and blockers included directly in the digest.
- Browser preview at `/digest.html`.
- Automated digest test.

## Current commercial loop
Ingest public data → qualify → rank → explain → show compliance requirements → add market context → create morning digest.

## External spend
Still $0 required for the runnable benchmark.
