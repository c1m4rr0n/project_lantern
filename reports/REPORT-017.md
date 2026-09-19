# Report 017 — RC7 Vendor Exclusion Watch pivot

Date: 2026-09-18
Milestone: `1.0.0-rc.7`
Status: local release gate passed; RC6 remains stable on Railway until the RC7 runtime is promoted and its live exclusions snapshot is validated.

## Executive decision
Project Lantern is deliberately pivoting its **primary commercial wedge** away from generic government-opportunity discovery and amendment intelligence.

The earlier product remains technically useful, but continued competitive review showed that discovery, pursue/skip scoring, amendment alerts and proposal compliance are already well represented in the GovCon software market. Building more of the same would increase scope without creating a strong reason to buy Lantern.

RC7 instead centers on **Vendor Exclusion Watch**: continuously screen a contractor's vendor/subcontractor roster against the official SAM.gov active exclusions extract, retain auditable evidence and alert when a vendor's screening state changes.

Opportunity Intelligence remains available as a secondary module rather than being deleted.

## Why this problem has economic value
The current FAR makes SAM exclusion status consequential in federal contracting and certain subcontracting contexts. FAR 9.405 describes the effect of active exclusion records. FAR 9.405-2 currently includes restrictions and notification requirements for certain subcontracts above the published threshold, and compliance with FAR 52.209-6 can be reviewed during Contractor Purchasing System Reviews.

Lantern does **not** translate that into a blanket legal conclusion. Different exclusion authorities can have different effects. The product is designed to answer a narrower operational question:

> Did any vendor on my roster acquire, lose or change a matching active exclusion record, and what official evidence did that screening use?

## Official data strategy
GSA documents a Public Exclusions Extract that contains the publicly available list of parties with a currently active exclusion in SAM.gov. Daily exclusion extracts are produced every day.

RC7 uses the Public V2 daily extract endpoint and stores:
- extract source date;
- source filename;
- downloaded ZIP SHA-256;
- fetch/cache/stale state;
- active `Firm` records needed for the vendor workflow.

The provider is shared across tenants. A 500-vendor customer does not create 500 API requests. One snapshot can screen all customers locally.

That matters for early economics: GSA currently documents 10 requests/day for a non-Federal user with no SAM role using a personal API key, while higher allowances are available to accounts with roles/system accounts. Lantern's shared-snapshot architecture is intentionally designed around the low-cost constraint.

## Identity policy
RC7 deliberately avoids declaring a vendor excluded based only on a fuzzy company-name match.

Priority:
1. exact UEI + CAGE;
2. exact UEI;
3. exact CAGE;
4. normalized legal name only -> `possible-match`, human review required;
5. no match -> `clear`, meaning only no matching record found in the snapshot.

The internal code state `excluded` is displayed to users as **ACTIVE EXCLUSION**. It is evidence of a matching active SAM record, not a legal ruling that a transaction is prohibited.

## What RC7 adds
### Provider / data layer
- Official SAM.gov Public V2 exclusions extract adapter.
- Native Node ZIP + CSV handling with no new runtime dependencies.
- Active-Firm filtering and UEI/CAGE/name indexes.
- Shared 20-hour cache and bounded 72-hour stale fallback.
- Source SHA-256 and snapshot metadata.
- `doctor:exclusions` command for a safe hosted extract validation without exposing the API key.

### Tenant workflow
- Vendor roster CRUD.
- Single-vendor and bulk screening.
- Persisted screening history.
- Baseline behavior that avoids a false alert on the first clear screen.
- Immediate alert for an initially risky match.
- Later status/evidence-change alerts.
- Alert acknowledgement.

### Automation
- Vendor-only tenants do not trigger the SAM opportunities feed.
- One shared exclusions snapshot is reused across tenants.
- Daily scheduler screens configured vendor rosters.
- Vendor status is included in the daily digest/outbox path.

### UI
- New `/vendors.html` watchlist.
- UEI/CAGE/legal-name capture.
- Screening source/evidence display.
- Snapshot age/stale state.
- Alert acknowledgement and removal.
- Landing page repositioned around continuous exclusion monitoring.

## Commercial hypothesis
Initial validation pricing remains a hypothesis, not a forecast or active billing plan:

- Starter: **$39/month**, up to 50 watched vendors.
- Team: **$99/month**, up to 500 watched vendors.

The product thesis is that a shared public-data snapshot plus low compute creates high gross-margin potential even at small-customer pricing. The next validation task is willingness-to-pay, not more feature breadth.

## Quality gate
Executable Node test suite:
- **69 / 69 tests: PASS**

Black-box/system smokes:
- auth lifecycle: PASS
- Vendor Watch: PASS
- Change Watch: PASS
- Requirement Delta: PASS
- scheduler/restart: PASS
- production readiness: PASS
- graceful process lifecycle: PASS

Forensic checks:
- secret scan: 135 files / 0 findings during the functional gate;
- `git diff --check`: clean after one trailing-blank-line defect was fixed;
- release gate repeated from scratch after the formatting fix.

The benchmark's previous static test counter was corrected in RC7: it had counted a JavaScript RegExp `.test(...)` call as a test declaration. It now reports the same **69** executable tests as Node's test runner.

## Defects / risks discovered during RC7
### False-positive risk from legal names
Company names are not reliable enough for an automatic exclusion determination.

Fix: legal-name-only matches are `possible-match`; exact UEI/CAGE receives the high-confidence state.

### Unnecessary opportunity API calls
The pre-pivot daily job always thought in terms of opportunity profiles.

Fix: vendor-only tenants can run completely without fetching the opportunities feed.

### Snapshot economics
Per-vendor upstream requests would consume quota linearly.

Fix: download/index one official active-exclusions snapshot and screen every tenant locally.

### Audit language
The word `excluded` can sound like Lantern itself made a legal determination.

Fix: UI copy uses **ACTIVE EXCLUSION**, shows source evidence, and includes a no-legal-determination disclaimer.

## Benchmark state after final RC7 implementation
From `reports/BENCHMARK.json`:
- milestone: 1.0.0-rc.7
- files: 132 before final report/ADR packaging
- auditable text/code lines: 6,461 before final report/ADR packaging
- executable automated tests: 69
- required paid API spend: $0
- LLM calls in critical path: 0
- completed human intervention categories: 3
- hosted SAM opportunities preflight: PASS

Hosting is live on Railway, but the actual Railway invoice has not been audited yet, so this report does **not** claim $0 total operating cost.

## Production status
RC6 remains live and healthy on Railway while RC7 is packaged. Existing production infrastructure includes:
- checksum-verified runtime;
- persistent `/data` volume;
- SAM.gov opportunity provider;
- SQLite storage;
- in-process scheduler;
- Railway `/api/ready` healthcheck.

RC7 will replace RC6 only after:
1. the exact runtime tarball is available to Railway;
2. startup SHA-256 verification passes;
3. healthcheck passes;
4. `doctor:exclusions --force` completes against the real public exclusions extract;
5. logs show source date/file and Firm record count without exposing the key.

RC6 remains the rollback artifact.

## Remaining paid-beta gates
1. Promote RC7 and validate a real hosted exclusions extract refresh.
2. Configure a verified transactional-email sender and test verification/reset delivery.
3. Add billing/subscription enforcement.
4. Add external error/uptime monitoring.
5. Replace the runtime-tarball deployment bootstrap with a durable write-capable source pipeline.
6. Validate demand with real federal contractors before expanding feature scope.

## Official references reviewed for this decision
- GSA SAM.gov Entity/Exclusions Extracts Download API: https://open.gsa.gov/api/sam-entity-extracts-api/
- FAR 9.405: https://www.acquisition.gov/far/9.405
- FAR 9.405-2: https://www.acquisition.gov/far/9.405-2
- FAR 52.209-6: https://www.acquisition.gov/far/52.209-6
