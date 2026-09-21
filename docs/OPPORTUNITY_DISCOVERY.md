# RC21 — profile-aware opportunity discovery

Pursuit Watch remains secondary to Vendor Watch. Discovery is deterministic; it is not an eligibility determination. No AI, new service or mandatory dependency is introduced. Existing `scoreOpportunity()` semantics, requirements, exclusion matching and billing enforcement are unchanged.

## Official API and query planning

Use the [SAM.gov Get Opportunities Public API v2](https://open.gsa.gov/api/get-opportunities-public-api/), never HTML scraping. `postedFrom` / `postedTo` are mandatory MM/dd/yyyy dates. SAM defines `offset` as **page index**, starting at 0, not record count. `limit` is at most 1,000; `totalRecords` determines page termination. Procurement types use repeated `ptype` parameters (`o`, `k`, `r`, `p`).

Unique valid NAICS codes (first 8 in profile order) are the primary searches. Without NAICS, derive at most 3 capability title phrases: normalize Unicode/case/whitespace/punctuation, discard short/numeric/generic business words, remove repeated words and deduplicate equivalent word sets while preserving the first phrase's input order. Each phrase contains at most four meaningful words. Multi-word phrases are preferred over issuing separate broad token queries. `IT services` alone produces no usable query; `cloud security consulting` becomes `cloud security`; repeated/near-duplicate variants do not add requests. Queries always retain a title filter even at the oldest horizon; there is no capability-only generic crawl. A name, set-aside or region alone is not a discovery profile. Empty/unusable criteria return HTTP 409 without SAM calls. The UI recommends NAICS for capability-only profiles.

For each NAICS/title, up to two recognized state codes receive priority, followed by an unscoped query. Remote/global/nationwide preferences never become invalid SAM state filters. Full state names are left unfiltered rather than guessed. Set-aside compatibility remains local scoring; queries do not exclude unrestricted work or assume certifications. Solicitation, combined synopsis/solicitation, sources sought and presolicitation are actionable. Awards, inactive notices, invalid/past deadlines and hard-blocked records are evaluated but not retained as new discovery. Missing deadlines remain eligible, with the unchanged scorer providing no deadline points. Server-side response-date filters are deliberately omitted to avoid hiding notices with missing dates.

## Pagination, horizon and stop rules

Search 30 days first, then expand coverage to 90, 180 and 365 days **only** while both quality targets have not been achieved and budget remains. Older expansions query non-overlapping calendar intervals; previously searched recent dates are not downloaded again. Pages are round-robin across planned queries so one NAICS cannot consume every page before others are attempted.

Globally deduplicate by SAM noticeId before scoring. Relevant means unblocked/actionable score >=55; strong means >=75. Stop once **both** target counts are reached, all horizons finish, or a safety budget is reached. These targets are not entitlements or promises of result volume. Capability-only profiles may not reach the strong target under the existing scorer; caps still apply.

`totalRecords` determines completion, including exactly-full pages. Inconsistent positive totals with an empty page are failures, not empty success. The raw cap counts duplicate records too; stop before requesting a full page that could exceed the remaining cap, so usage can finish slightly below the cap. A hard 100-page ceiling includes cache hits. Attempted coverage is not a completeness guarantee: the UI explicitly marks safety-limited searches as partial.

The official API also documents 404 for “No Data found”. Only that explicit message on a first page is accepted as an empty result (plain text or a JSON message/error); a generic 404 or missing continuation page fails closed. Authentication errors and outages never become empty successful feeds. Unrecognized upstream response formats require investigation rather than permissive guessing.

## Optional configuration (no production change required)

| Variable | Default | Clamp |
| --- | ---: | --- |
| SAM_OPPORTUNITY_PAGE_SIZE | 500 | 1–1,000 |
| DISCOVERY_MAX_RAW_CANDIDATES | 5,000 | 1–10,000 |
| DISCOVERY_MAX_API_REQUESTS | 20 | 1–50 |
| DISCOVERY_TARGET_RELEVANT | 250 | 1–2,000 |
| DISCOVERY_TARGET_STRONG | 50 | 1–500 |
| DISCOVERY_RETAIN_RELEVANT | 500 | 1–2,000 |
| DISCOVERY_RETAIN_EXPLORATION | 100 | 0–500 |
| DISCOVERY_MAX_ELAPSED_MS | 120,000 | 1,000–180,000 |
| DISCOVERY_REQUEST_INTERVAL_MS | 250 | 0–5,000 |
| OPPORTUNITY_CACHE_TTL_MS | 900,000 | 1,000–86,400,000 |
| OPPORTUNITY_MAX_STALE_MS | 86,400,000 | TTL–604,800,000 |
| DISCOVERY_FRESHNESS_MS | OPPORTUNITY_CACHE_TTL_MS (900,000) | 1,000–86,400,000 |
| SAM_DAILY_REQUEST_BUDGET | unset (no daily allowance claimed) | Optional positive safe integer; invalid/unset disables only the daily cap |

Invalid/non-finite values use defaults; numeric values are floored/clamped. Daily SAM quotas depend on key role. Operators should choose conservative settings within their actual quota, not interpret per-discovery caps as a daily quota guarantee. The process serializes discovery HTTP calls and coalesces identical in-flight pages. Up to three transient attempts use 500/1,000ms backoff; each attempt consumes the request budget. 429 establishes a cooldown (Retry-After seconds where provided, otherwise 60 seconds), with no immediate retry. Persistent 4xx fails closed; 5xx/network retries are bounded. Tracked per-notice refresh retains its existing independent cache/freshness policy.

## Cache, isolation and errors

Manual `POST /api/sync` reuses the tenant's saved successful summary/feed while the profile fingerprint is unchanged and the freshness period has not elapsed. No provider or tracked-notice request is performed; `reused:true` identifies this response. The summary's request counts/timestamp describe the original search, not new requests. A submitted `force:true` field has no effect and no normal-user force-refresh control exists. GET/page reload only reads state. The UI shows a localized **Last searched** timestamp and explains fresh-result reuse. Scheduled discovery keeps its normal tracked-refresh path and exact-page caches; scheduler timing/idempotency is unchanged.

`/data/cache/sam-discovery` stores up to 256 normalized public page responses. SHA-256 filenames cover the exact endpoint/date/filter/type/limit/offset identity, excluding credentials. There are no tenant scores or profiles in these shared entries. Identical fresh queries make no upstream calls; matching concurrent queries share one request. Stale fallback is explicit, only for rate-limit/transient unavailability within existing configured freshness limits, never for authentication/invalid-response errors. Errors preserve the tenant's previous feed and summary; they never become empty successful results.

`GET /api/discovery` is authenticated and tenant-bound. It returns configured/mode/profile-changed flags and the last successful summary: raw, unique, evaluated, relevant, strong, retained, requests, pages, attempted horizon, timestamp, cache counts, stale flag and stop reason. Public health exposes only the query-scoped provider mode, not personalized metrics. Structured discovery logs contain counts/timing/status, not names, capabilities, queries, credentials, private evidence or response bodies.

## Shared SAM request accounting and fair scheduled work

All runtime SAM providers created by `createProviders` share one process/application ledger for the configured credential. It counts actual upstream dispatches for manual/scheduled discovery, every retry, tracked-notice refresh, description enrichment and SAM exclusions API fetches. Cache hits and coalesced request followers are free. Redirect hops back to SAM count separately; a downstream ZIP download on a non-SAM host does not consume SAM API allowance. Discovery rejects redirects at its fixed API endpoint to keep its per-discovery request cap exact.

`SAM_DAILY_REQUEST_BUDGET` is an optional **operator-selected application limit**, not a claim about SAM's quota. No daily quota is hard-coded. Unset, zero, negative, fractional, non-numeric or unsafe-integer input means the daily allowance is unknown; request accounting and existing per-discovery controls remain active. This app uses a UTC calendar-day accounting window, independently of any SAM account reset policy. Usage outside this application/credential deployment (other apps or standalone diagnostics) cannot be observed; operators must leave appropriate headroom and choose a limit/window policy consistent with their account. No SAM credential is changed or written to the ledger.

The ledger is `/data/ops/sam-request-budget.json`, written atomically **before** dispatch. It survives application restart; a crash after charging but before dispatch may conservatively overcount, never refund an already-sent request. Serialized admission prevents concurrent manual/scheduled requests overspending. Missing/corrupt/unwritable operational state fails closed when it cannot be trusted; repair and restart may be required. Backward clock movement does not reopen old allowance. Keep one authoritative writable application process/data root; this is not a distributed quota service. Do not run a second `job:daily` worker against the live volume. Read-only `npm run sam:usage` reports UTC window, configured limit or null, counts by operation/source, remaining allowance or null, and reset time without network access or secrets.

At the start of a scheduled opportunity batch, reserve equal shares of the remaining configured allowance for eligible tenants. Indivisible remainder slots rotate by sorted tenant IDs and UTC day, so account iteration order receives no preference. Early tenants and concurrent manual work cannot consume another tenant's reserved slots. Each discovery is capped by its grant as well as its normal request limit; tracked/description calls draw on that same grant. Unused reservations are released in `finally`; the daily outbox keeps its existing idempotency. The primary shared exclusions snapshot is fetched once before opportunity reservations, not once per tenant. With a very small allowance some tenants receive zero slots; very small shares may defer a complete tracked refresh, rather than dropping history or exceeding allowance.

If admission is refused because global allowance or a scheduled share is exhausted, preserve the last successful feed, summary and buffered Change Watch events. Return temporary refresh-unavailable (HTTP 503 with a safe code/retryAt); do not return empty success and do not fall back to a newly successful stale discovery. Already-fresh manual results may still be read/reused. The tenant UI gets only temporary availability/timestamp, not other tenants' usage. Persisted deferral prevents repeated clicks/scheduler attempts from hammering upstream until the UTC window permits more calls. A short reservation-contention/storage-error deferral uses 60 seconds, not an invented daily allowance. Scheduler budget deferral uses the preserved feed for its normal digest and records `discoveryUnavailable`; other tenants and vendor work continue when their resources are available. Logs `sam.upstream.request` / `sam.upstream.deferred` contain only operation, source, counts/window or safe reason, never tenant profiles, URLs, credentials or tokens.

## Retention and tracked pursuits

After a successful discovery retain the highest scored relevant candidates (default 500) plus lower-score actionable exploration candidates (default 100), with stable noticeId tie-breaking. Replace old untracked discovery records absent from this bounded set; no background database/schema migration is needed. This is snapshot replacement on successful refresh, not a claim of time-based deletion when discovery has never run.

Reviewing/Pursue opportunities are exempt from discovery caps and retain description, requirements, evidence, decisions, acknowledgements and existing Change Watch history. Out-of-feed tracked notices still use per-notice refresh, with the previous record retained if refresh fails. Decisions are reread before pruning to preserve newly tracked notices. Existing history limits (50 changes per notice) are unchanged. Concurrent syncs coalesce per tenant; profiles changed during discovery reject the stale-plan result. Daily scheduling, durable outbox and idempotency remain unchanged; each eligible tenant now gets its own profile-driven discovery rather than a globally personalized feed.

## Validation and promotion

### Presentation trust boundary

The default Relevant view contains scores >=55; Strong is >=75; Explore is <55 and explicitly not recommended. Every score has its band label. When a successful summary has zero relevant records, show “No relevant opportunities found right now.” with profile-review and Explore actions. Do not automatically open a lower-score record, even when it is the highest retained score. Opening Explore selects nothing until the user chooses a card; a refresh preserves a selected item only if still visible. Business-profile signals and favorable pursuit conditions are displayed separately. None of these presentation rules changes the scorer, discovery retention or legal/evidence semantics.

### Official description failures

The [official public API documentation](https://open.gsa.gov/api/get-opportunities-public-api/) describes a credentialed description link and “Description not found” when unavailable. RC21 classifies missing descriptions, malformed responses, authentication/configuration failures, rate limits and transient outages without exposing raw bodies or sensitive URLs. The known production 500 is an observed symptom, not a proven root cause; this branch uses mocked failures and no production credentials.

Description fetches use at most three transient attempts, 500/1,000ms backoff and 10-second request timeouts. Permanent/auth/malformed failures do not retry. A 429 establishes a process-wide description-provider cooldown using Retry-After seconds or HTTP-date (one minute if absent/invalid), including forced actions and other notices. Every dispatched retry/metadata recovery remains charged by the shared SAM ledger; budget errors propagate without retries. Official HTTPS hosts only, no automatic description redirects. Existing valid cached descriptions may be returned within SAM_DETAIL_MAX_STALE_MS, explicitly labeled stale, not represented as current.

A broken or missing description URL may be re-resolved once through forced same-notice metadata; only a matching notice ID and validated replacement URL are used. Failed repair preserves valid stale evidence, when available. Provider failures leave the rest of Pursuit Watch usable and offer Open official source. Safe logs contain category and upstream status only. No new environment setting or production change is required for this pass.

Before production promotion, perform the manual NAICS 115310 / first-20-results acceptance in reports/RC21-VALIDATION.md; this is pending operator work, not a CI/live-provider test.

All CI SAM responses are mocked. `npm run release:gate` covers discovery tests alongside all previous smokes; workstation-only `scripts/qa-discovery-browser.js` uses disposable localhost SQLite/mock providers. `PLAYWRIGHT_MODULE` may point to externally installed Playwright; it is not a runtime dependency. RC21 is a PR candidate only. No Railway/DNS/Stripe Live/SAM key changes are needed or performed. After an approved future promotion, an operator should validate readiness, source identity and one real profile/SAM search within their quota; local fixtures do not prove live account access or SAM availability.
