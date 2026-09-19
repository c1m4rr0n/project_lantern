# Report 016 — RC6 Requirement Delta / Pursuit Change Intelligence

Date: 2026-09-18
Milestone: `1.0.0-rc.6`
Status: release gate passed locally; deployment artifact not yet promoted to Railway.

## Why this milestone exists
A competitive review showed that opportunity discovery, pursue/skip scoring and generic amendment alerts already exist in the GovCon market. RC6 therefore changes the commercial center of Project Lantern from "find contracts" to **Pursuit Change Intelligence**.

The target question is no longer just:

> Did this solicitation change?

It is:

> What changed, what requirement changed, did it create a blocker for this company, how did the fit recommendation move, and what source text caused that conclusion?

## Product decisions made autonomously
1. Keep discovery/matching as acquisition and workflow infrastructure, not the core differentiator.
2. Add deterministic Requirement Delta instead of introducing an LLM into the critical path.
3. Add explicit company-configured `hardBlockers` rather than inferring legal eligibility.
4. Treat the first tracked description analysis as a silent baseline to avoid false amendment alerts.
5. Force a fresh official-description retrieval when a metadata change is detected; otherwise reuse the shared detail cache.
6. Carry Requirement Delta into the daily digest so the capability works without a user opening the application.

## RC6 implementation
### Requirement Delta
For tracked `reviewing` / `pursue` opportunities, Lantern compares requirement candidates extracted from official SAM.gov description versions.

Deterministic classification:
- unchanged exact normalized text;
- modified text paired by token Dice similarity;
- added requirements;
- removed requirements.

Each delta retains source text and mandatory signal.

### Hard blockers
Company profiles now accept explicit hard-blocker phrases such as:
- `secret facility clearance`
- `CMMC level 2`
- `onsite only`

If an added or modified requirement contains a configured blocker phrase, Lantern labels the delta as a blocker. This is auditable phrase matching, not a legal eligibility determination.

### Fit impact
Change events can now include:
- score before / after;
- score delta;
- recommendation before / after;
- blocked before / after;
- new risks;
- resolved risks.

A configured hard blocker forces score `0` and recommendation `skip` with the triggering phrase visible.

### Automatic daily operation
The in-process scheduler now passes the shared SAM detail provider into the daily run. Requirement monitoring therefore happens in automation, not only after manual UI enrichment.

### UI / digest
The UI now displays:
- Requirement Delta counts;
- added / modified / removed evidence;
- blocker badges;
- fit impact before → after;
- score blocked state.

The daily digest carries the same summary and blocker information.

## Important behavior validated
A controlled test used:
- prior requirement: `Offeror must provide three past performance examples.`
- new requirement: `Offeror must provide five past performance examples.`
- new blocker: `Offeror must hold a Secret facility clearance.`
- company hard blocker: `secret facility clearance`

Lantern produced:
- 1 modified requirement;
- 1 added requirement;
- 1 blocker;
- fit result moved to score `0 / skip`;
- source evidence remained visible.

## Quality gate
Final RC6 gate before documentation closure:
- 61 / 61 automated tests: PASS
- auth lifecycle smoke: PASS
- Change Watch smoke: PASS
- Requirement Delta smoke: PASS
- scheduler/restart smoke: PASS
- production-readiness smoke: PASS
- process lifecycle smoke: PASS
- secret scan: 123 repository files, 0 findings

A final staged-file scan will be repeated before tagging.

## Bugs / design defects found during RC6
### False first-change risk
Naively comparing an empty requirement set to the first fetched description would report every baseline requirement as newly added.

Fix: the first tracked description analysis establishes a baseline and creates no change event.

### Stale compliance candidates
The previous enrichment merge behavior could preserve machine-extracted requirement candidates that no longer existed in the current description.

Fix: machine-extracted rows are reconciled against the current extraction while non-machine/manual fixture rows are preserved.

### Daily monitoring gap
Manual `/sync` had access to the SAM detail provider but the daily scheduler path did not.

Fix: `detailProvider` is now wired through scheduler → daily run → OpportunityService.

## Benchmark state
From `reports/BENCHMARK.json` after RC6 implementation:
- milestone: 1.0.0-rc.6
- files: 122
- auditable text/code lines: 5,565
- automated tests: 61
- paid API spend required: $0
- LLM calls in critical path: 0
- human interventions completed so far: 3
- hosted SAM preflight: PASS

## Production status
The stable hosted runtime remains RC4 on Railway while RC6 is packaged. RC4 has:
- persistent `/data` volume;
- successful healthcheck;
- checksum-verified runtime bootstrap;
- live SAM.gov connectivity validated with HTTP 200.

RC6 will replace RC4 only after the RC6 runtime artifact is available to Railway and passes hosted health + logs. RC4 remains the rollback artifact.

## Remaining launch gates
1. Promote RC6 to Railway and validate Requirement Delta against the hosted runtime.
2. Configure a verified transactional-email sender.
3. Validate live verification/reset email delivery.
4. Add billing/subscription enforcement.
5. Add external production error monitoring.
6. Replace the temporary runtime-tarball bootstrap with a durable write-capable source/deploy pipeline.

## Next product extension
Attachment-level delta is the most logical extension: version/fingerprint permitted public attachments, extract text where practical, then feed attachment requirement changes into the same Requirement Delta model.
