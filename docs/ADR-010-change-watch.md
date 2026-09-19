# ADR-010 — Retain tracked opportunities and watch material public changes

Date: 2026-09-18
Status: accepted for `1.0.0-rc.5`.

## Context
Lantern intentionally keeps the discovery window short to control SAM.gov calls and make the daily queue current. That created a product-risk edge case: an opportunity already marked `reviewing` or `pursue` could fall outside the rolling window and disappear from the tenant workspace even though the customer still cared about it.

Government notices can also change after the initial review. A deadline shift, set-aside change, resource/document link change or place-of-performance change can materially alter a pursuit decision. Merely showing the newest record gives no audit trail of what changed.

## Decision
1. Treat `reviewing` and `pursue` as durable tracking states, not just UI labels.
2. Keep tracked opportunities in the tenant workspace even when absent from the latest rolling discovery feed.
3. Refresh each tracked SAM notice directly by `noticeid`, using a narrow mandatory posted-date range derived from its original posting date and a keyed cache.
4. Fingerprint only material public fields; do not include local notes, scores or enrichment text in the public-change fingerprint.
5. Record a change event only when the material fingerprint differs; make array-valued fields order-insensitive.
6. Keep change history tenant-isolated and require explicit acknowledgement rather than deleting events.
7. Surface unread changes in the opportunity detail and daily digest.

## Consequences
- A pursued notice no longer silently disappears because it aged out of discovery.
- Lantern can explain **what changed**, not just that SAM has a newer record.
- Direct notice refresh adds bounded upstream traffic only for actively tracked work. Shared caching limits repeated calls.
- SAM.gov remains the source of truth; Lantern records observed deltas, not legal interpretations of amendments.
- Customers still need to review the official notice and attachments before relying on a change.
