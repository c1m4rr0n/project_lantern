# RC21 — profile-aware opportunity discovery validation

## Scope and provenance

Branch: `codex/rc21-profile-aware-opportunity-discovery`.
Base: `afdff08fa87012fb2d35167bc9a06d7b6355021e`, fetched and verified as origin/main before editing. Remote: c1m4rr0n/project_lantern. Tracked worktree was clean; the pre-existing untracked `_handoff/` was preserved and is excluded from the commit. Baseline Node 22 full release gate: 124/124 tests, all smokes, secret scan PASS.

Source identity: 1.0.0-rc.21. Production RC20 identity is operator-reported, not independently rechecked through Railway in this task. No automatic merge or deployment is authorized.

## Implementation

- Deterministic NAICS-first query plan with stable deduped inputs, conservative state priority/unscoped fallback and small capability-title fallback; empty profiles fail before provider access.
- Official SAM v2 page-index pagination, totalRecords termination, global noticeId deduplication, 30/90/180/365-day non-overlapping adaptive windows and local-score quality targets.
- Default 500/page, 5,000 raw, 20 HTTP attempts, 120-second elapsed and hard 100-page bounds. Retries count against budget. Partial searches are labeled; provider errors preserve the old feed.
- Exact-query public raw page cache, shared in-flight queries, serialized requests, transient-only bounded retries/stale fallback, rate-limit cooldown, sanitized structured telemetry.
- Tenant-local discovery summary and single-flight sync. Bounded current relevant/exploration retention; tracked Reviewing/Pursue records preserve evidence/history and per-notice refresh.
- Find/Refresh opportunities UX, NAICS guidance, empty-profile CTA/disabled action, evaluated/matches/strong/coverage metrics and explicit empty/error/stale/partial states. RC20 shell behavior preserved.
- Source/deployment/product/security documentation and optional environment tuning; no new mandatory dependency or schema migration.

## Automated checks

Final local Node 22 release gate: 161/161 tests; syntax, auth, vendor-watch, billing, Change Watch, requirement delta, scheduler, production preflight, lifecycle, commercial smoke and secret scan all PASS. `git diff --check` PASS. The commercial HTTP smoke now also verifies discovery authentication, empty-profile rejection, successful mock discovery and summary isolation. The documented SAM 404 “No Data found” first-page response is distinguished from generic 404/provider failures.

New regression coverage includes single/multiple/exactly-1,000 pages, totalRecords termination, dedupe across pages/NAICS/horizons, 30→90→180→365 expansion and each early stop, candidate/request/time caps, capability-only and unconfigured profiles, deadlines/types/blockers, retention, transient/4xx/429/malformed upstream behavior, explicit stale bounds, exact-query cache reuse across distinct local scoring profiles, tenant-isolated storage in SQLite/JSON, concurrent sync, profile change rejection and daily personalized discovery/outbox idempotency. Existing scoring/Change Watch tests remain unchanged.

All CI data is mocked; no live SAM request is made by tests. The small legacy `doctor:sam` connectivity probe remains explicitly operator-run and is not the runtime discovery path.

## Browser evidence (local disposable SQLite, Chrome headless)

Widths: 360, 390, 430, 768, 980, 1024, 1100, 1440.

- `scripts/qa-discovery-browser.js`: 56 state/width checks — unconfigured, NAICS, capabilities-only, populated, empty, provider error, stale cache. Zero horizontal page overflow or JavaScript errors. Shell visibility/focus, 44px controls and inline error preservation checked.
- `scripts/qa-polish-browser.js`: 64 responsive page checks + 32 profile checks. Keyboard Enter/Tab/Escape, focus return, outside-click close, mobile vs desktop shell, long account identity, vendor import/archive/capacity flows and authentication confirmations pass.
- Screenshots generated in the task's local `work/rc21-discovery-qa` and `work/rc21-shell-qa` directories (not production, not runtime assets). Representative mobile/desktop images were visually inspected. Four metrics now form a complete 2×2 mobile grid.
- Reproduce with externally installed Playwright via `PLAYWRIGHT_MODULE`, optional `RC21_QA_OUTPUT` / `RC20_QA_OUTPUT`. Neither script accepts a remote base URL.

Browser fixtures validate rendering, not live SAM search quality or coverage completeness. Human Android/device review and an approved, quota-aware real SAM profile search remain post-review/operator checks. No production account or production data was used.

## CI and release boundary

Required PR checks are `release-gate (ubuntu-latest)` and `release-gate (windows-latest)`. Ubuntu additionally builds Docker and verifies production-shaped `/api/ready`. Exact head/check links and current results are recorded on the PR and in the implementation handoff, rather than asserted from local tests alone.

Railway, DNS, production variables/data, SAM credentials, Stripe Live, repository visibility and main are untouched. No historical release artifact removed. No force-push or automatic merge. Vendor exclusion matching, opportunity score semantics, billing entitlements, evidence/history limits, database topology and scheduler timing/idempotency remain unchanged. Optional tuning and operational limitations are documented in docs/OPPORTUNITY_DISCOVERY.md.
