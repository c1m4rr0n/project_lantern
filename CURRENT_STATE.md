# ExcluSignal — current source state

Source version: 1.0.0-rc.21. `release.json` and `package.json` are authoritative for source version. The operator reports healthy RC20 production/main at `afdff08fa87012fb2d35167bc9a06d7b6355021e`; this task verified that origin/main matched that exact commit before branching. No Railway operation or production smoke test was performed. See CURRENT_DEPLOYMENT.md for evidence boundaries.

RC21 is a PR-only candidate, NOT deployed: deterministic profile-aware SAM opportunity discovery, page-index pagination, adaptive horizons, bounded requests/retention, exact-query raw cache, tenant-specific summaries and customer-facing discovery UX. See docs/OPPORTUNITY_DISCOVERY.md and reports/RC21-VALIDATION.md. Existing opportunity scoring, Change Watch, requirement extraction, vendor screening, billing and scheduler timing/idempotency remain unchanged.

Final RC21 requirements add shared persisted SAM request accounting, optional SAM_DAILY_REQUEST_BUDGET with fair scheduled tenant grants, normalized meaningful capability phrases, and saved manual-search reuse via DISCOVERY_FRESHNESS_MS. The UI shows last-searched time and temporary budget unavailability without losing the prior feed. `npm run sam:usage` is an operator-only read-only aggregate diagnostic. The existing RC21 branch/PR #5 is continued without rewriting history or duplicating the PR; its base still matches the latest origin/main RC20 line.

Final PR #5 trust/enrichment pass defaults Pursuit Watch to Relevant (>=55), keeps lower scores behind explicit Explore, avoids auto-promoting weak results and separates business-profile signals from favorable conditions. Official-description failures are safely classified with bounded retries, Retry-After cooldown, labeled stale fallback and same-notice URL repair. Scoring/retention are unchanged. Manual live-SAM forestry acceptance is required before promotion; no live validation or deployment was performed.

RC20 adds a shared accessible desktop/mobile shell, consistent verified-session entry to Vendor Watch, password confirmation/show-hide, contextual capacity feedback, confirmed CSV review, live vendor updates, workspace settings and redesigned print evidence. See docs/RC20_POLISH_AUDIT.md and reports/RC20-VALIDATION.md for dated implementation evidence.

RC19 adds Scale public naming (internal team key retained), internal milestone analytics/summary CLI, password-confirmed account export and deletion with billing closure checks, crash-recoverable cleanup, durable Stripe replay protection, sandbox-only reconciliation, draft legal materials and a disabled-by-default public indexing switch. Multi-user membership remains future work.

RC18 adds confirmed CSV import (1 MiB / 1,000 rows), duplicate/capacity validation, archival/restoration preserving screening history, CSV and print-ready evidence reports, and optional SUPPORT_EMAIL. Archived vendors do not count as active slots and are never screened; restoration requires capacity. Import never automatically screens.

Tracked source was restored at `03ed304`. RC14/15 improved responsive/accessibility UX and vendor submission. RC16 restores SAM snapshot metadata on process startup.

RC17 prepares direct Docker/source deployment, Linux/Windows CI, non-secret release identity, durable account/billing audit events, safe operational error metadata and optional S3-compatible verified backup upload. No external monitor or bucket is provisioned.

Vendor Exclusion Watch remains primary. Matching/scoring/requirements are deterministic. SQLite remains one writable instance on /data; JSON storage remains supported for local testing.

See docs/COMMERCIAL_OPERATIONS.md for migration/rollback and optional configuration, and docs/PRODUCTION_PIPELINE.md for main protection and operator-confirmed Railway watch patterns. Source deployment is complete. Remaining external gates include independent backup restore drill, external alerts, reviewed legal/business decisions and Stripe Live approval. Historical reports and QA_HANDOFF describe their dated releases, not current production.
