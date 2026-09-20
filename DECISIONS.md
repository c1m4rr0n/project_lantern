# ExcluSignal — Key Engineering and Product Decisions

These decisions capture the intent behind the current system. They may be changed when evidence justifies it, but they should not be reversed accidentally during refactoring.

## D1 — Deterministic evidence-first core

Critical exclusion matching and current pursuit scoring/Requirement Delta logic are deterministic and auditable. Do not insert an LLM into the exclusion determination path. If AI is added later, use it as an assistive layer with clear evidence boundaries, not as the unreviewable source of truth.

## D2 — Human-in-the-loop for ambiguous identity and legal meaning

A normalized company-name match alone is not enough to declare an active exclusion. Name-only matches require human review. A matching SAM record is evidence, not an automatic legal ruling.

## D3 — Vendor Watch is the primary commercial wedge

Opportunity intelligence remains useful but secondary. Optimize first for reliable vendor/subcontractor monitoring, evidence retention and alerts rather than broadening generic opportunity-discovery features.

## D4 — Shared exclusions snapshot, local tenant screening

Download/index the official active-exclusions snapshot once and reuse it across tenants. Do not make one upstream request per watched vendor. This controls quota/cost and keeps daily screening scalable for the early product.

## D5 — SQLite before managed Postgres

SQLite was selected for the early one-service benchmark because it provides durable transactional persistence with little operational overhead. This choice implies **one writable replica**. Trigger for reconsideration: horizontal scaling, multi-region writes, sustained contention, higher availability requirements or operational complexity that justifies Postgres.

## D6 — In-process scheduler for the current topology

The scheduler runs inside the single web process because the SQLite volume belongs to that service and a second worker/cron would add coordination and cost. Trigger for reconsideration: migration to a network database or a need for independent worker scaling/reliability.

## D7 — Durable outbox before provider delivery

Application jobs persist an email intent before delivery. Email-provider failure must not erase daily work. Verification/reset attempt immediate Resend delivery when configured, while keeping the durable retry path.

## D8 — Production readiness fails closed

Unsafe production defaults, missing required provider/billing/email configuration, unwritable/mismatched data roots and SQLite integrity failures must block readiness/startup rather than silently degrade public onboarding.

## D9 — Tracked pursuits survive rolling discovery windows

`reviewing` and `pursue` work items are durable tenant state and are refreshed directly by official notice ID. Do not let a short discovery lookback make tracked opportunities disappear.

## D10 — First requirement analysis is a baseline

The first official description analysis for a tracked opportunity establishes baseline requirements and must not generate a false "everything was added" amendment event.

## D11 — Explicit hard blockers, not inferred legal blockers

Hard blockers are configured by the customer as phrases/concepts. Matching an added/modified requirement can force a skip/score 0, but the triggering source text and configured phrase must remain visible.

## D12 — Commercial name is ExcluSignal; Project Lantern is internal

Public UI/email/process identity should use `ExcluSignal`. `Project Lantern` may remain in engineering history and benchmark documentation. Preliminary name/domain collision checks are not trademark clearance.

## D13 — Billing is a server-side authorization boundary

Trial/subscription state and vendor limits gate mutations and upstream work at the server. Expired/inactive accounts may retain permitted read access, but UI hiding alone must never be the paywall.

## D14 — Beta static assets currently avoid stale mixing

RC13 intentionally uses `Cache-Control: no-store, max-age=0` for static beta assets and versioned asset URLs because RC12 demonstrated that new HTML could be rendered with old cached CSS. A future optimized cache strategy is acceptable only with content-hashed/versioned assets and regression coverage against mixed-version rendering.

## D15 — Vendor Watch onboarding does not require NAICS

A user can monitor vendors immediately after account verification. Company profile/NAICS/capabilities are for Pursuit Watch matching. Do not reintroduce Company profile as a mandatory gate for Vendor Watch.

## D16 — Source code must become the deployment source of truth

Tarball bootstrap deployment was a workaround for earlier GitHub write limitations. Now that Codex can write to the repository, restore source, tests, docs and scripts to tracked Git. Preserve release tarballs for traceability/rollback, but do not continue development by editing opaque tarballs as the primary workflow.

## D17 — Release status requires evidence from the effective runtime

A Railway deployment marked `SUCCESS` is not enough. Confirm the effective runtime through expected checksum/version/startup logs and health/API behavior. This rule exists because `redeploy` previously reused an older snapshot even after the service configuration changed.
## D18 — Source release and effective deployment are separate identities

release.json/package.json identify prepared source. Runtime commit is supplied by an explicit validated environment value. CURRENT_DEPLOYMENT records separately verified deployed state; branch version bumps never imply deployment.

## D19 — Commercial hardening without multi-user claims

Scale is the public name for the existing team billing key and 500-vendor entitlement, not invitations/roles. Archival preserves vendor history and frees active capacity; restoration rechecks capacity. Imports require preview/explicit confirmation and never auto-screen.

## D20 — Account erasure fails closed

Require password plus explicit confirmation, reconcile ended billing before erasure, drain in-process work and persist restart recovery. Keep minimal opaque deletion receipts until relevant backups expire. Incomplete cleanup requires repair/restart, never silent partial success. Legal retention and public policy approval remain human decisions.

## D21 — Personalized discovery, public query cache

Company criteria drive bounded deterministic SAM searches, never a generic empty-profile crawl. NAICS takes priority; capabilities use a small title-query fallback. Raw page caches are shared only by exact public query identity; tenant profiles/scores/results and discovery summaries are tenant-local. Local scoring determines quality stops; request/candidate/time caps always bound search. Success replaces only untracked discovery candidates according to explicit retention limits. Reviewing/Pursue evidence and per-notice Change Watch are preserved. Provider errors cannot become empty successful feeds. See docs/OPPORTUNITY_DISCOVERY.md; this does not change billing entitlements or exclusion matching.
