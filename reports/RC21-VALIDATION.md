# RC21 — profile-aware opportunity discovery validation

## Scope and provenance

Branch: `codex/rc21-profile-aware-opportunity-discovery`.
Base: `afdff08fa87012fb2d35167bc9a06d7b6355021e`, fetched and verified as origin/main before editing. Remote: c1m4rr0n/project_lantern. Tracked worktree was clean; the pre-existing untracked `_handoff/` was preserved and is excluded from the commit. Baseline Node 22 full release gate: 124/124 tests, all smokes, secret scan PASS.

Final-requirements continuation: existing branch/PR #5 reused, based on the still-current origin/main above (RC20 ancestry reverified). No history rewrite or duplicate PR. Before these additions, the full existing RC21 gate passed 161/161 tests. The original RC21 implementation remains in commit `d9f486dabecc41883d31acbddfde62d3d6bc2416`; this follow-up extends it rather than discarding approved work.

Source identity: 1.0.0-rc.21. Production RC20 identity is operator-reported, not independently rechecked through Railway in this task. No automatic merge or deployment is authorized.

## Implementation

- Deterministic NAICS-first query plan with stable deduped inputs, conservative state priority/unscoped fallback and small capability-title fallback; empty profiles fail before provider access.
- Official SAM v2 page-index pagination, totalRecords termination, global noticeId deduplication, 30/90/180/365-day non-overlapping adaptive windows and local-score quality targets.
- Default 500/page, 5,000 raw, 20 HTTP attempts, 120-second elapsed and hard 100-page bounds. Retries count against budget. Partial searches are labeled; provider errors preserve the old feed.
- Exact-query public raw page cache, shared in-flight queries, serialized requests, transient-only bounded retries/stale fallback, rate-limit cooldown, sanitized structured telemetry.
- Tenant-local discovery summary and single-flight sync. Bounded current relevant/exploration retention; tracked Reviewing/Pursue records preserve evidence/history and per-notice refresh.
- Find/Refresh opportunities UX, NAICS guidance, empty-profile CTA/disabled action, evaluated/matches/strong/coverage metrics and explicit empty/error/stale/partial states. RC20 shell behavior preserved.
- Source/deployment/product/security documentation and optional environment tuning; no new mandatory dependency or schema migration.
- Shared persisted UTC SAM request accounting, optional operator-selected daily cap (no assumed quota), fair scheduled tenant reservations, redirect/retry accounting, safe deferral and aggregate `sam:usage` CLI. Runtime discovery, tracked notices, descriptions and SAM exclusions share the same ledger.
- Deterministic normalized capability phrases (maximum 3), generic `IT services` rejection, near-duplicate suppression and no unrestricted fallback.
- Manual result reuse during configured freshness, persisted last-searched timestamp, no normal-user force-refresh, and temporary refresh-unavailable UI preserving previous results.

## Automated checks

Final local Node 22 release gate: 175/175 tests; syntax, auth, vendor-watch, billing, Change Watch, requirement delta, scheduler, production preflight, lifecycle, commercial smoke and secret scan all PASS. `git diff --check` PASS. The commercial HTTP smoke also verifies discovery authentication, empty-profile rejection, successful mock discovery, summary isolation and freshness reuse despite an attempted `force:true`. The documented SAM 404 “No Data found” first-page response is distinguished from generic 404/provider failures.

New regression coverage includes single/multiple/exactly-1,000 pages, totalRecords termination, dedupe across pages/NAICS/horizons, 30→90→180→365 expansion and each early stop, candidate/request/time caps, capability-only and unconfigured profiles, deadlines/types/blockers, retention, transient/4xx/429/malformed upstream behavior, explicit stale bounds, exact-query cache reuse across distinct local scoring profiles, tenant-isolated storage in SQLite/JSON, concurrent sync, profile change rejection and daily personalized discovery/outbox idempotency. Existing scoring/Change Watch tests remain unchanged.

Final safeguards additionally test invalid/unset quota values, concurrent shared admission, persisted usage after restart, UTC rollover/clock reversal, fair shares/remainder rotation, cache-free accounting, retries, SAM redirect hops, corrupt ledger failure, no retry/stale success on budget denial, unchanged feed/summary/history on tracked-budget denial, manual freshness across service instances, temporary-error recovery and scheduled 3-tenant/6-request fairness. The scheduled integration proves 2 requests per tenant; repeated budget-deferred jobs retain summaries and outbox idempotency without new upstream calls. Two earlier token-fallback expectations were deliberately updated to assert the newly approved multi-word phrase behavior, not weakened.

All CI data is mocked; no live SAM request is made by tests. The small legacy `doctor:sam` connectivity probe remains explicitly operator-run and is not the runtime discovery path.

## Browser evidence (local disposable SQLite, Chrome headless)

Widths: 360, 390, 430, 768, 980, 1024, 1100, 1440.

- `scripts/qa-discovery-browser.js`: 72 state/width checks — unconfigured, NAICS, capabilities-only, populated, empty, provider error, stale cache, fresh reuse, budget unavailable. Zero horizontal page overflow or JavaScript errors. Last-searched text, preserved metrics, disabled budget-exhausted action, shell visibility/focus, 44px controls and inline error preservation checked. Real local mock HTTP repeat sync verifies reuse.
- `scripts/qa-polish-browser.js`: 64 responsive page checks + 32 profile checks. Keyboard Enter/Tab/Escape, focus return, outside-click close, mobile vs desktop shell, long account identity, vendor import/archive/capacity flows and authentication confirmations pass.
- Final screenshots generated in the task's local `work/rc21-final-discovery-qa` and `work/rc21-final-shell-qa` directories (not production, not runtime assets). Representative mobile/desktop images were visually inspected. Four metrics form a complete 2×2 mobile grid.
- Reproduce with externally installed Playwright via `PLAYWRIGHT_MODULE`, optional `RC21_QA_OUTPUT` / `RC20_QA_OUTPUT`. Neither script accepts a remote base URL.

Browser fixtures validate rendering, not live SAM search quality or coverage completeness. Human Android/device review and an approved, quota-aware real SAM profile search remain post-review/operator checks. No production account or production data was used.

## CI and release boundary

Required PR checks are `release-gate (ubuntu-latest)` and `release-gate (windows-latest)`. Ubuntu additionally builds Docker and verifies production-shaped `/api/ready`. Exact head/check links and current results are recorded on the PR and in the implementation handoff, rather than asserted from local tests alone.

Railway, DNS, production variables/data, SAM credentials, Stripe Live, repository visibility and main are untouched. No historical release artifact removed. No force-push or automatic merge. Vendor exclusion matching, opportunity score semantics, billing entitlements, evidence/history limits, database topology and scheduler timing/idempotency remain unchanged. Optional tuning and operational limitations are documented in docs/OPPORTUNITY_DISCOVERY.md.

Residual boundaries: accounting covers this single authoritative application/data-root process, not other applications or standalone probes sharing the SAM account; a UTC application budget is not SAM's quota/reset guarantee. Operators must size/headroom the optional cap for discovery plus tracked/detail/exclusion traffic. Tiny shares can defer a tracked refresh; cached history is retained rather than silently overspending. Corrupt ledger storage requires repair/restart; dispatch-before-crash may conservatively overcount. Live SAM quality/account access and real-device visual approval remain external checks. No production variable is mandatory to deploy RC21; this task changes none.
