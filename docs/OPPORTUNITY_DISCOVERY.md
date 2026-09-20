# RC21 — profile-aware opportunity discovery

Pursuit Watch remains secondary to Vendor Watch. Discovery is deterministic; it is not an eligibility determination. No AI, new service or mandatory dependency is introduced. Existing `scoreOpportunity()` semantics, requirements, exclusion matching and billing enforcement are unchanged.

## Official API and query planning

Use the [SAM.gov Get Opportunities Public API v2](https://open.gsa.gov/api/get-opportunities-public-api/), never HTML scraping. `postedFrom` / `postedTo` are mandatory MM/dd/yyyy dates. SAM defines `offset` as **page index**, starting at 0, not record count. `limit` is at most 1,000; `totalRecords` determines page termination. Procurement types use repeated `ptype` parameters (`o`, `k`, `r`, `p`).

Unique valid NAICS codes (first 8 in profile order) are the primary searches. When absent, the first 3 significant unique capability title terms are the bounded fallback. A name, set-aside or region alone is not a discovery profile. Empty/unusable criteria return HTTP 409 without SAM calls. The UI recommends NAICS for capability-only profiles.

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

Invalid/non-finite values use defaults; numeric values are floored/clamped. Daily SAM quotas depend on key role. Operators should choose conservative settings within their actual quota, not interpret per-discovery caps as a daily quota guarantee. The process serializes discovery HTTP calls and coalesces identical in-flight pages. Up to three transient attempts use 500/1,000ms backoff; each attempt consumes the request budget. 429 establishes a cooldown (Retry-After seconds where provided, otherwise 60 seconds), with no immediate retry. Persistent 4xx fails closed; 5xx/network retries are bounded. Tracked per-notice refresh retains its existing independent cache/freshness policy.

## Cache, isolation and errors

`/data/cache/sam-discovery` stores up to 256 normalized public page responses. SHA-256 filenames cover the exact endpoint/date/filter/type/limit/offset identity, excluding credentials. There are no tenant scores or profiles in these shared entries. Identical fresh queries make no upstream calls; matching concurrent queries share one request. Stale fallback is explicit, only for rate-limit/transient unavailability within existing configured freshness limits, never for authentication/invalid-response errors. Errors preserve the tenant's previous feed and summary; they never become empty successful results.

`GET /api/discovery` is authenticated and tenant-bound. It returns configured/mode/profile-changed flags and the last successful summary: raw, unique, evaluated, relevant, strong, retained, requests, pages, attempted horizon, timestamp, cache counts, stale flag and stop reason. Public health exposes only the query-scoped provider mode, not personalized metrics. Structured discovery logs contain counts/timing/status, not names, capabilities, queries, credentials, private evidence or response bodies.

## Retention and tracked pursuits

After a successful discovery retain the highest scored relevant candidates (default 500) plus lower-score actionable exploration candidates (default 100), with stable noticeId tie-breaking. Replace old untracked discovery records absent from this bounded set; no background database/schema migration is needed. This is snapshot replacement on successful refresh, not a claim of time-based deletion when discovery has never run.

Reviewing/Pursue opportunities are exempt from discovery caps and retain description, requirements, evidence, decisions, acknowledgements and existing Change Watch history. Out-of-feed tracked notices still use per-notice refresh, with the previous record retained if refresh fails. Decisions are reread before pruning to preserve newly tracked notices. Existing history limits (50 changes per notice) are unchanged. Concurrent syncs coalesce per tenant; profiles changed during discovery reject the stale-plan result. Daily scheduling, durable outbox and idempotency remain unchanged; each eligible tenant now gets its own profile-driven discovery rather than a globally personalized feed.

## Validation and promotion

All CI SAM responses are mocked. `npm run release:gate` covers discovery tests alongside all previous smokes; workstation-only `scripts/qa-discovery-browser.js` uses disposable localhost SQLite/mock providers. `PLAYWRIGHT_MODULE` may point to externally installed Playwright; it is not a runtime dependency. RC21 is a PR candidate only. No Railway/DNS/Stripe Live/SAM key changes are needed or performed. After an approved future promotion, an operator should validate readiness, source identity and one real profile/SAM search within their quota; local fixtures do not prove live account access or SAM availability.
