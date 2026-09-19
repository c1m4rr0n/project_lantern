# RC17–RC19 validation and handoff — 2026-09-19

## Scope and commits

- Base: c4fbcca604654c2d0d5a55b0dc8a417ff33329e8, RC16, main and origin/main matched at start.
- Branch: codex/rc17-19-commercial-hardening. No automatic merge.
- RC17: 0f8e915, 98 unit tests passing and full release gate passing on Windows / Node 24.18.0.
- RC18: bee76a2, 102 unit tests passing and full release gate passing on Windows / Node 24.18.0.
- RC19: commit titled “RC19: prepare account lifecycle and commercial beta”; 110 unit tests and full release gate validated on Windows / Node 22.23.2. Earlier RC19 gate also passed on Node 24.18.0 before the final extra checkout regression.

The Node 22 binary used for QA was downloaded from nodejs.org and checked against the release SHA-256 manifest. It is a workspace-local QA runtime, not a change to project dependencies or the system installation.

## Coverage

Full gate includes syntax checking for all JavaScript, unit tests, auth, vendor watch, billing, opportunity changes, requirement delta, scheduler/restart, production readiness, lifecycle, new commercial HTTP smoke and secret scan.

Added coverage: release drift, isolated/durable audit (SQLite/JSON), optional S3 upload integrity/retry/manifest order, malformed/quoted/bounded CSV, intra-file/stored duplicates, concurrent entitlement capacity, archive/restore without history loss, HTML/CSV injection, export redaction, erasure/billing blocking/restart recovery, fair maintenance exclusion, first-party milestone deduplication, noindex defaults, Stripe deletion/stale/replayed events, old-subscription cancellation after new activation, duplicate checkout/expiry.

Commercial HTTP smoke covers two tenants, explicit import, over-capacity rejection without partial insertion, report isolation, archived screen rejection, history preservation, restore, password/Origin checks, account deletion/session revocation and private-beta robots/sitemap.

Local visual QA used synthetic data and a temporary database, not production: Vendor Watch and Account at 390×844 and desktop Account at 1440×1000. Confirmed account identity, archive/report controls, semantic hidden import confirmation, password/explicit deletion controls and no observed horizontal overflow. Corrected oversized Account cards after visual inspection. This is not a claim of exhaustive assistive-technology or real-device certification.

## Files/features

Infrastructure: Dockerfile and .dockerignore, .github/workflows/ci.yml, release.json, src/runtime/release.js, src/security/events.js, src/ops/offsite-backup.js and scheduler/status integration.

Onboarding: src/services/vendor-import.js, src/services/vendor-export.js, vendor service/routes, public/vendor-tools.js, Vendor Watch markup/styles and new vendor-commercial tests.

Accounts/commercial: src/services/account-lifecycle.js, src/services/analytics.js, src/security/activity.js, src/runtime/launch.js, public/account.html and account.js, billing/Stripe/storage integration, analytics-summary/doctor-stripe/check-all/smoke-commercial scripts, account-commercial and billing-lifecycle tests.

Documentation: README, AGENTS, PROJECT_CONTEXT, DECISIONS, CURRENT_STATE, CURRENT_DEPLOYMENT, security/deployment/product runbooks, COMMERCIAL_OPERATIONS, VENDOR_ONBOARDING, ACCOUNT_LIFECYCLE and three clearly marked legal drafts. .env.example includes disabled optional configuration.

## External validation still required

- Docker is not installed in this Windows environment. CI includes Linux image build and production-shaped readiness, but no hosted CI/Docker success is claimed before it runs on the future PR.
- No real S3 endpoint/bucket upload or independent restore drill was performed; tests use fake HTTP and real local verified SQLite backups.
- No new external Stripe session/charge or live SAM download was performed. Stripe lifecycle tests are synthetic; any provider validation must remain sandbox until separately authorized.
- Configure protected-branch rules after successful CI; review and merge only with user instruction.
- Provision private offsite storage and external monitor/alert delivery; test restoration and deletion reapplication.
- Approve support contact, legal/business/tax/trademark and retention decisions. Draft legal materials are not live policies.
- Execute the separately approved Railway source migration following COMMERCIAL_OPERATIONS, preserving one writer and compatible rollback.

## Risks and conservative choices

SQLite remains single-writer. Old RC16 does not understand archive state, so rollback after adopting RC18 data requires compatible binaries or a deliberate verified restore. Audit/analytics event pruning occurs on append; screening/history retention remains bounded. Logical deletion does not immediately erase SQLite free pages, backups or provider records. Opaque deletion receipts remain until relevant backups expire, rather than automatically deleting proof needed to prevent restore-time resurrection.

Interrupted deletion fails closed until repaired/restarted. Ambiguous billing, unknown checkout completion or a lost expiry webhook can require manual reconciliation. Checkout retry is deliberately blocked in that state rather than risking duplicate subscriptions. No multi-user membership model is claimed.

## Safety confirmation

Railway production was NOT modified. Stripe Live was NOT activated. No real card was charged. DNS, repository visibility, production secrets and existing RC archives/checksums were not changed. The pre-existing _handoff directory remains untouched and excluded from commits. No force push or history rewrite is used.
