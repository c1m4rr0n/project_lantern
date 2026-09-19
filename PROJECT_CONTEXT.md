# ExcluSignal / Project Lantern — Project Context

## Product

**Commercial name:** ExcluSignal
**Internal/engineering codename:** Project Lantern
**Public domain:** `exclusignal.com`

Primary positioning:

> Federal vendor exclusion monitoring with evidence.

The product helps federal contractors monitor vendors/subcontractors against official SAM.gov active exclusions, preserve the evidence behind each screen, and surface changes over time. It deliberately avoids turning a matching record into an automatic legal conclusion.

## Current modules

### 1. Vendor Watch — primary product wedge

- Tenant-managed vendor roster.
- Capture legal name, UEI, CAGE and internal note.
- Single and bulk screening.
- Official SAM.gov Public V2 active-exclusions extract.
- Conservative identity matching.
- Persisted screening history and source metadata.
- Alert when a vendor becomes risky, clears, or evidence changes.
- Acknowledge alerts.
- Daily scheduled screening and digest integration.

### 2. Pursuit Watch — secondary module

- SAM.gov opportunity discovery.
- Company profile with NAICS, capabilities, set-asides, regions, negative keywords and explicit hard blockers.
- Deterministic fit scoring.
- Workflow decisions such as reviewing/pursue/pass.
- Change Watch for material public opportunity changes.
- Requirement Delta: added/modified/removed requirement candidates with source text.
- Fit-impact tracking before -> after.
- Explicit hard blockers can force score 0 / skip with auditable evidence.

### 3. Daily Brief

- Combines vendor exclusion-watch state and pursuit/opportunity information.
- Durable email outbox.
- Resend delivery adapter with retryable persistence.

### 4. Account and billing

- Registration and password authentication.
- Email verification required before authenticated application access.
- Password-reset lifecycle invalidates older sessions.
- Signed cookies and tenant-bound sessions.
- 14-day trial.
- Trial vendor limit: 25.
- Starter hypothesis: $39/month, 50 vendors.
- Team hypothesis: $99/month, 500 vendors.
- Stripe Checkout, Customer Portal, signed webhooks, idempotent event processing and server-side entitlements.

Prices remain product-validation hypotheses, not revenue forecasts.

## Technical architecture

- Node.js 22+, ESM.
- HTTP server implemented directly with Node.
- SQLite is the current production persistence layer.
- One writable application instance with persistent `/data` volume.
- JSON storage driver remains for compatibility/testing.
- In-process scheduler performs daily work, outbox delivery and backup coordination.
- Native SQLite backup with integrity check, SHA-256 manifest and retention.
- Shared provider caches limit repeated upstream calls.
- No LLM required in the core screening path.

### Main source areas

- `server.js` — HTTP/API/static entry point and runtime composition.
- `src/auth/` — password/session lifecycle.
- `src/billing/` — plans, entitlement service, Stripe adapter.
- `src/domain/` — scoring, requirements, changes, decisions, profile validation.
- `src/providers/` — SAM opportunity/detail/watch/exclusions, USAspending, mocks, caching.
- `src/services/` — tenant context, vendors, opportunities, digest logic.
- `src/notifications/` — auth/digest email, durable outbox, delivery.
- `src/ops/` — scheduler, daily run, backup, operational status.
- `src/storage/` — account, tenant, JSON and SQLite persistence.
- `public/` — landing, auth, Vendor Watch, Pursuit Watch, Daily Brief, Company and Plan UI.

## Why the product pivoted

The initial project focused on government opportunity discovery and pursue/skip intelligence. Competitive review showed that generic discovery, scoring and amendment alerts were crowded. The commercial center moved to **Vendor Exclusion Watch**, where a shared official exclusions snapshot can screen many tenant vendors locally and preserve evidence at low marginal cost.

Pursuit intelligence was kept because it is technically useful and includes differentiated Requirement Delta behavior, but it is no longer the primary reason to buy ExcluSignal.

## Important history

- **RC1:** operational core; SQLite, durable outbox, backup/readiness boundaries.
- **RC3:** restart-safe in-process scheduler for the one-service/one-volume architecture.
- **RC4:** fail-fast production startup and volume/runtime preflight.
- **RC5:** tracked opportunity Change Watch and durable retention outside rolling discovery windows.
- **RC6:** Requirement Delta and deterministic pursuit-impact intelligence.
- **RC7:** primary pivot to Vendor Exclusion Watch; live official exclusions extract architecture.
- **RC8:** commercial name ExcluSignal and public brand separation from internal codename.
- **RC9:** trial entitlements and Stripe billing boundary.
- **RC10:** paid-beta hardening based on a real hosted signup + Stripe sandbox lifecycle.
- **RC12:** SaaS-style visual shell, improved navigation and persistent signed-in identity in the header.
- **RC13:** stale-asset/cache fix, mobile shell refinement and clearer first-use onboarding.

## Verified live evidence accumulated during development

- Railway service operational with persistent `/data`.
- Hosted SAM.gov Opportunities preflight returned HTTP 200.
- Hosted SAM Public V2 exclusions extract was downloaded and parsed successfully.
- On 2026-09-18 the hosted validation indexed 8,283 active `Firm` records from the official extract.
- Resend sending domain verified and real API delivery observed.
- Stripe sandbox lifecycle validated through Checkout, signed webhook activation, Customer Portal and scheduled cancellation-at-period-end update.
- Custom domain `exclusignal.com` is active.

Do not present those historical observations as permanent current counts; recheck live state when the number/date matters.

## Product language constraints

Preferred user-facing terms:

- `ACTIVE EXCLUSION` for a high-confidence matching active SAM record.
- `REVIEW` / possible match for name-only or ambiguous matches.
- `NO MATCH` / clear means only that no matching active record was found in the snapshot.
- `Screening aid` / `evidence` language is deliberate.

Avoid wording that says ExcluSignal has legally determined a company is ineligible.

## Current UX direction

Mobile RC13 is coherent and usable. The next UI polish candidates, after source restoration, are:

- enforce `ExcluSignal` capitalization everywhere;
- reduce mobile nav density;
- move `Screen all` from the global header area into Vendor Watch content/action hierarchy;
- polish the plan/usage strip;
- make the legal screening notice more compact without hiding it;
- reduce mobile form vertical density;
- reduce oversized Vendor Watch hero text on small screens;
- display `Not screened yet` rather than a bare dash for an empty source snapshot.

These are RC14 candidates, not permission to change core screening behavior.
