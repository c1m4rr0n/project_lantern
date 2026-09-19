# ADR-007 — Durable outbox before direct email sending

**Decision:** daily jobs write deterministic email intents to a local outbox. A separate delivery process sends and archives them.

**Why:** ingestion should not fail merely because email is unavailable. Failed provider/network sends remain retryable. Each daily message has a stable tenant/date idempotency key. The first external sender is Resend through its REST API; console delivery remains available for zero-cost demos.
