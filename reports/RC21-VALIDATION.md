# RC21 — profile-aware opportunity discovery validation

## Scope and provenance

Branch: `codex/rc21-profile-aware-opportunity-discovery`.
Base: `afdff08fa87012fb2d35167bc9a06d7b6355021e`, fetched and verified as origin/main before editing. Remote: c1m4rr0n/project_lantern. Tracked worktree was clean; the pre-existing untracked `_handoff/` was preserved and is excluded from the commit. Baseline Node 22 full release gate: 124/124 tests, all smokes, secret scan PASS.

Final-requirements continuation: existing branch/PR #5 reused, based on the still-current origin/main above (RC20 ancestry reverified). No history rewrite or duplicate PR. Before these additions, the full existing RC21 gate passed 161/161 tests. The original RC21 implementation remains in commit `d9f486dabecc41883d31acbddfde62d3d6bc2416`; this follow-up extends it rather than discarding approved work.

Source identity: 1.0.0-rc.21. Production RC20 identity is operator-reported, not independently rechecked through Railway in this task. No automatic merge or deployment is authorized.

Trust/enrichment continuation (2026-09-21): verified requested head `40d87707c5741ddfd0984b0438753071538c512a`, same branch and PR #5. Baseline gate passed 175/175 tests and all smokes. This pass changes presentation and description error recovery only, not scoring weights, discovery retention, billing or exclusion screening.

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

Final local Node 22 release gate: 196/196 tests; syntax, auth, vendor-watch, billing, Change Watch, requirement delta, scheduler, production preflight, lifecycle, commercial smoke and secret scan all PASS. `git diff --check` PASS. The commercial HTTP smoke also verifies discovery authentication, empty-profile rejection, successful mock discovery, summary isolation and freshness reuse despite an attempted `force:true`. The documented SAM 404 “No Data found” first-page response is distinguished from generic 404/provider failures.

New regression coverage includes single/multiple/exactly-1,000 pages, totalRecords termination, dedupe across pages/NAICS/horizons, 30→90→180→365 expansion and each early stop, candidate/request/time caps, capability-only and unconfigured profiles, deadlines/types/blockers, retention, transient/4xx/429/malformed upstream behavior, explicit stale bounds, exact-query cache reuse across distinct local scoring profiles, tenant-isolated storage in SQLite/JSON, concurrent sync, profile change rejection and daily personalized discovery/outbox idempotency. Existing scoring/Change Watch tests remain unchanged.

Final safeguards additionally test invalid/unset quota values, concurrent shared admission, persisted usage after restart, UTC rollover/clock reversal, fair shares/remainder rotation, cache-free accounting, retries, SAM redirect hops, corrupt ledger failure, no retry/stale success on budget denial, unchanged feed/summary/history on tracked-budget denial, manual freshness across service instances, temporary-error recovery and scheduled 3-tenant/6-request fairness. The scheduled integration proves 2 requests per tenant; repeated budget-deferred jobs retain summaries and outbox idempotency without new upstream calls. Two earlier token-fallback expectations were deliberately updated to assert the newly approved multi-word phrase behavior, not weakened.

All CI data is mocked; no live SAM request is made by tests. The small legacy `doctor:sam` connectivity probe remains explicitly operator-run and is not the runtime discovery path.

Final trust regressions: real unchanged scorer with NAICS 115310 and unrelated hardware yields 45/35/30 with no business-profile signals; mixed 82/63/45 and exact 54/55/74/75 boundaries validate filtering, selection preservation and classification. Description tests cover 401/403, 404/410, 429, 5xx/network retries, malformed/missing/HTML/JSON responses, budget refusal, HTTP-date/seconds Retry-After, cross-notice cooldown, bounded valid stale cache, same-notice URL repair (including stale recovery), preserved evidence/history and missing tenant-owned notices. The old untrusted-URL test now asserts the controlled error code instead of an internal English error string.

## Exact trust and enrichment behavior

- Default Relevant shows >=55; Strong shows >=75; Explore shows only <55. Numeric scores have visible Strong / Relevant / Low relevance labels.
- Successful zero-relevant discovery says “No relevant opportunities found right now.” and explains that evaluated records did not meet the relevance threshold. Review company profile and Explore lower-confidence results are available. This is not a provider failure or a claim SAM had no data.
- Initial selection is the highest visible >=55 result only. Opening Explore selects nothing; the user explicitly opens a low-relevance card. Refresh preserves selection only while it remains visible. Favorable pursuit conditions are separated from business-profile signals; absent NAICS/capability evidence says “No strong business-profile match detected.”
- Description failures return safe categories with controlled 404/502/503 responses; raw upstream bodies/URLs/keys are never returned or logged. Only transient/network failures retry (three total attempts, 500/1,000ms backoff, 10-second request timeout). 429 defers until Retry-After (seconds or HTTP-date, default one minute) with no immediate retry, including across other notices in the process.
- Valid previously cached descriptions may be shown explicitly stale within the existing age limit. Budget refusal is never retried or converted into new stale success. Broken/not-found description links may trigger one forced same-notice metadata lookup and one replacement-link attempt; tenant evidence/workflow is not replaced by metadata. The official source link remains available, with safe SAM notice-ID fallback.
- This hardens observed failure modes; the specific production 500 was not reproduced or diagnosed using production logs/credentials. No claim is made that its exact historical root cause is proven.

## Browser evidence (local disposable SQLite, Chrome headless)

Widths: 360, 390, 430, 768, 980, 1024, 1100, 1440.

- `scripts/qa-discovery-browser.js`: 104 state/width checks — the nine previous states plus Explore-only, Relevant-only, mixed quality, and description failures. All five enrichment error categories are exercised at every width. Zero horizontal page overflow or JavaScript errors. Score-label containment, explicit Explore/keyboard selection, default/Strong filtering, preserved visible selection on refresh, last-searched text, metrics, 44px controls and shell focus checked. Real local mock HTTP repeat sync verifies reuse.
- `scripts/qa-polish-browser.js`: 64 responsive page checks + 32 profile checks. Keyboard Enter/Tab/Escape, focus return, outside-click close, mobile vs desktop shell, long account identity, vendor import/archive/capacity flows and authentication confirmations pass.
- Final screenshots generated in the task's local `work/rc21-trust-qa` and `work/rc21-trust-shell-qa` directories (not production, not runtime assets). Representative mobile/desktop images were visually inspected. Four metrics form a complete 2×2 mobile grid; score labels fit their badges with inherited high-contrast text.
- Reproduce with externally installed Playwright via `PLAYWRIGHT_MODULE`, optional `RC21_QA_OUTPUT` / `RC20_QA_OUTPUT`. Neither script accepts a remote base URL.

Browser fixtures validate rendering, not live SAM search quality or coverage completeness. Human Android/device review and an approved, quota-aware real SAM profile search remain post-review/operator checks. No production account or production data was used.

### Required operator acceptance BEFORE production promotion

Using an authorized real test profile such as NAICS **115310** (forestry support), run **one** live SAM discovery within the account's quota in the approved candidate environment. Inspect the first 20 default Relevant results (or all when fewer than 20) and confirm plausible forestry-support relevance. If none meet the threshold, confirm the no-relevant-results state rather than a promoted low-score item. Explicit Explore may contain broader records, but all must be labeled Low relevance and none auto-open. Record source notice IDs, time, summary and any implausible results for human review. Do not run this acceptance against live SAM from CI. This operator step remains pending; local/mock QA cannot establish real search quality.

## Final SAM pacing pass (2026-09-21)

Continued the same PR #5 from verified head f3cf0482da445dd533bf85e6f6f01682e0428dd9. Default DISCOVERY_REQUEST_INTERVAL_MS is now 1000 (unchanged 0–5000 clamp); optional SAM_POST_DISCOVERY_QUIET_MS defaults to 1500 (0–10000 clamp). Manual live descriptions wait only the remaining quiet interval since the last process-local SAM dispatch. Fresh cached descriptions bypass both wait and request accounting. No scoring, thresholds, retention, profile, Vendor Watch, billing, tenant isolation or frontend file changed.

Nine new deterministic tests in tests/sam-pacing.test.js cover defaults/clamps, eight serialized pages dispatched at 0/1000/…/7000ms, coalescing/cache bypass, retry backoff overlap, remaining quiet time, no quota charged while waiting, fresh manual description cache, explicit amendment refresh, safe 429/Retry-After and queued cooldown recheck, concurrent admissions/failed attempts, and disabled/scheduled quiet behavior. All new pacing sleeps advance mocked time; no live SAM is called. Existing stale-cache and error-UI tests remain active. No browser QA rerun was needed for this backend-only pass; the prior 104/64/32 browser evidence above is retained, not presented as a new run.

### Operator-reported live preview evidence and required repeat

The operator reports the prior candidate successfully discovered **80 evaluated, 6 relevant, 0 strong, 8 SAM.gov discovery requests/pages**, across **30 → 90 → 180 → 365 days**, in approximately **2.4 seconds**, with NAICS **115310**. Relevant results included forestry/fuels/wildfire/land-management opportunities. Immediate official-description enrichment then received SAM HTTP 429, safely classified category=rate_limited / upstreamStatus=429. This is operator-supplied preview evidence, not a live test performed by this coding task.

After this pacing patch, the operator must repeat in the approved preview environment:
1. Find opportunities with NAICS 115310.
2. Confirm relevance quality is unchanged (results/counts may vary with SAM data).
3. Immediately analyze the first opportunity's official description.
4. Confirm no 429 under normal conditions; record request spacing/timing and safe pacing logs.
5. If SAM still returns 429, confirm the safe rate-limited UI, Retry-After deferral, no request hammering, and usable Open official source link.

This repeat is **pending**, must precede promotion, and must never be run against live SAM from CI. A slower default mitigates bursts but is not a guarantee against upstream account limits, shared external traffic or sustained-rate policies. Explicit existing env overrides are not changed automatically.

## CI and release boundary

Required PR checks are `release-gate (ubuntu-latest)` and `release-gate (windows-latest)`. Ubuntu additionally builds Docker and verifies production-shaped `/api/ready`. Exact head/check links and current results are recorded on the PR and in the implementation handoff, rather than asserted from local tests alone.

Railway, DNS, production variables/data, SAM credentials, Stripe Live, repository visibility and main are untouched. No historical release artifact removed. No force-push or automatic merge. Vendor exclusion matching, opportunity score semantics, billing entitlements, evidence/history limits, database topology and scheduler timing/idempotency remain unchanged. Optional tuning and operational limitations are documented in docs/OPPORTUNITY_DISCOVERY.md.

Residual boundaries: accounting covers this single authoritative application/data-root process, not other applications or standalone probes sharing the SAM account; a UTC application budget is not SAM's quota/reset guarantee. Operators must size/headroom the optional cap for discovery plus tracked/detail/exclusion traffic. Tiny shares can defer a tracked refresh; cached history is retained rather than silently overspending. Corrupt ledger storage requires repair/restart; dispatch-before-crash may conservatively overcount. Live SAM quality/account access and real-device visual approval remain external checks. No production variable is mandatory to deploy RC21; this task changes none.
