# Project Lantern — Report 015
## Milestone: 1.0.0-rc.5 Change Watch and tracked-opportunity retention
Date: 2026-09-18

## Why this milestone changed
After the first live Railway/SAM.gov deployment, competitive review showed that “decide whether to pursue a bid” is already a crowded message. RC5 therefore strengthens a narrower, evidence-first workflow: retain opportunities the contractor has chosen to review, refresh them from the official source, and show material public changes with an audit trail.

## Product defect found before implementation
The short SAM discovery lookback controlled API volume, but it created a correctness risk: an opportunity marked `reviewing` or `pursue` could disappear once its original posting aged outside the rolling discovery feed.

RC5 fixes that defect before layering Change Watch on top. Tracked opportunities are now durable tenant work items and receive direct official refreshes by SAM notice ID.

## Implemented
- `src/domain/change-detection.js`: deterministic material snapshots, fingerprints and field-level diffs.
- `src/providers/sam-watch.js`: notice-id refresh with a narrow posted-date window, TTL cache and bounded stale fallback.
- Tracked `reviewing/pursue` opportunities are retained outside the rolling discovery feed.
- Change events are tenant-isolated, deduplicated and acknowledgeable.
- SQLite and JSON storage drivers persist change history.
- `GET /api/opportunities/:id/changes`.
- `POST /api/opportunities/:id/changes/ack`.
- Daily digest reports tracked-pursuit changes.
- Opportunity UI shows a changed badge, before → after values and a reviewed action.

## What counts as material
The RC5 public fingerprint covers fields that can change pursuit execution or qualification: title, response deadline, notice type, solicitation number, agency, set-aside, PSC, NAICS, active state, place of performance and public resource links.

It deliberately excludes local notes, Lantern scores, generated requirement candidates and other tenant-side workflow state.

## Automated QA
Second release gate, executed from the real Git repository:
- automated tests: **55/55 passing**;
- auth smoke: **PASS**;
- Change Watch HTTP smoke: **PASS**;
- scheduler/restart smoke: **PASS**;
- production-readiness smoke: **PASS**;
- lifecycle smoke: **PASS**;
- secret scan: **117 repository files, 0 findings**;
- `git diff --check`: **clean**.

Change Watch smoke observed:
- tracked opportunity: `mock-001`;
- unread before acknowledgement: `1`;
- acknowledged: `1`;
- unread after acknowledgement: `0`.

## Live-infrastructure evidence inherited from Report 014
Railway deployment has already proved the runtime and primary data source outside the build container:
- checksum-verified runtime artifact;
- persistent `/data` volume;
- `/api/ready` healthcheck passed;
- live SAM.gov preflight: HTTP `200`, JSON response, `recordsReceived=1`;
- running provider line reported `sam provider + sqlite storage + scheduler`.

The one-off SAM startup preflight was removed after validation to avoid spending an extra API call on every redeploy.

## Failure / issue log for this milestone
The first RC5 release gate failed at the secret-scan step because it was run from a non-Git worktree copy. All product tests and smoke tests had passed. RC5 was then integrated into the canonical Git repository and the entire gate was rerun from zero; it passed.

This is recorded as a release-process failure, not hidden or reclassified as a product pass.

## Cost state
- Mandatory paid **API** spend remains `$0` for SAM.gov/USAspending usage.
- Railway is now real infrastructure; actual hosting charges have not yet been independently audited, so this report does **not** claim total operating spend is $0.
- Change Watch adds no paid provider or LLM dependency.

## Human intervention count
Three unavoidable interventions have been completed so far:
1. obtaining the SAM.gov credential;
2. authorizing Railway;
3. manually uploading the secret-free checksum-verified runtime tarball to GitHub because the connected GitHub integration could read the repository but returned HTTP 403 for content writes.

## Next gate
1. Commit/tag RC5 and deploy the checksum-verified runtime to Railway.
2. Validate Change Watch against the hosted service without exposing secrets.
3. Configure a real transactional-email provider and sending identity.
4. Only after live email works, switch the hosted instance from staging to production readiness.
5. Scaffold subscription billing and entitlement enforcement.
