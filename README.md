# ExcluSignal / Project Lantern

Vendor Exclusion Watch is the primary product: monitor vendor/subcontractor identifiers against public SAM.gov active exclusions, preserve evidence, review ambiguous matches and track changes. Pursuit Watch remains secondary. Core matching, scoring and requirement extraction are deterministic; no LLM makes screening decisions.

## Current state

Source version is in `release.json`, checked against `package.json` by the release gate. Production runs RC19 directly from GitHub main on Railway, operator-confirmed at `2c09f7df4601048dd602e77e486e85dd27943d5d`; see CURRENT_DEPLOYMENT.md. Historical tarballs remain available for provenance. Pipeline hardening does not activate Stripe Live or enable indexing.

RC17: direct-source Docker readiness, release identity, CI, structured operational errors, durable audit and optional S3-compatible backup.
RC18: confirmed CSV import, non-destructive vendor archive/restore, CSV and print-friendly evidence reports, optional support contact.
RC20 (candidate, not deployed): shared responsive workspace navigation, secure-access form polish, contextual capacity, live watchlist updates, CSV review, settings and print evidence. [Copy audit](docs/RC20_POLISH_AUDIT.md) and [validation](reports/RC20-VALIDATION.md).

RC19: Scale naming, private first-party analytics, password-confirmed account export/deletion, subscription lifecycle/reconciliation coverage and draft launch/legal materials.

## Local development and validation

Requires Node 22+ with native SQLite support. No npm dependency installation is required.

```sh
npm start
npm run release:gate
```

Use the variables in `.env.example` for local mock operation; never commit real secrets. On Windows, use PowerShell environment assignments rather than POSIX inline assignments.

The gate runs syntax checks for all source/UI/script/test JavaScript, the automated test suite, auth/vendor/billing/change/requirement/scheduler/readiness/lifecycle/commercial HTTP smokes, release-version consistency and secret scan.

Optional browser QA: `node scripts/qa-polish-browser.js` uses a workstation-provided Playwright installation (`PLAYWRIGHT_MODULE` if outside normal resolution) and Chrome. It starts its own loopback-only mock server with a temporary data root; it never accepts a production URL. `RC20_QA_OUTPUT` selects an external screenshot directory. No runtime/browser dependency was added to the package. See the validation report for coverage and human device/assistive-technology checks.

## CI status

GitHub Actions runs Node 22 on Linux and Windows for pull requests to main and pushes to main, with Docker build/readiness on Linux. Main requires PRs, an up-to-date branch and both checks (including for admins); force pushes and deletion are blocked. Normal merge commits remain allowed. See [Production pipeline](docs/PRODUCTION_PIPELINE.md) for exact settings and operator-confirmed deployment watch patterns.

## Account and plans

Each account has one tenant; roles/invitations are not implemented. Trial: 14 days / 25 active vendors. Proposed Starter: $39/month / 50 vendors; Scale: $99/month / 500 vendors. The internal Scale key remains `team`, preserving Stripe price configuration. No revenue or real charge is claimed.

Server-side entitlements gate active monitoring and creation. Inactive accounts can read retained history and export/delete their data subject to authentication and billing safety. Archival preserves existing evidence; restoring checks capacity.

## Operations

```sh
npm run backup
npm run job:daily
npm run outbox:deliver
npm run doctor:sam
npm run doctor:exclusions
npm run analytics:summary
npm run doctor:stripe
```

SQLite has one writable instance on persistent /data. Keep the in-process scheduler and durable outbox. Health is liveness and non-secret metadata; readiness fails closed on unsafe production configuration. Optional offsite failures are separately visible and do not invalidate local backups.

## Runbooks and boundaries

- [Deployment identity](CURRENT_DEPLOYMENT.md) and [source state](CURRENT_STATE.md).
- [Source migration, monitoring, offsite backup and rollback](docs/COMMERCIAL_OPERATIONS.md).
- [Vendor import, archive and reports](docs/VENDOR_ONBOARDING.md).
- [Export/deletion, analytics, Stripe doctor and future launch](docs/ACCOUNT_LIFECYCLE.md).
- [Security](docs/SECURITY.md), [product](docs/PRODUCT.md) and [decisions](DECISIONS.md).
- [Legal review checklist](docs/legal/LAUNCH_LEGAL_CHECKLIST.md): drafts only, not approved public policies.

Human/external gates remain: review/merge of future changes, backup bucket/restore drill, alert delivery, reviewed business/legal/tax/trademark decisions, real sandbox validation and explicit live-payment/launch approval. Historical reports describe their dated releases, not current production.
