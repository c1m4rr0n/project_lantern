# AGENTS.md — ExcluSignal / Project Lantern

This repository is the engineering source for **ExcluSignal**, internally traceable as **Project Lantern**.

## Read this before editing

Read these files in order before making non-trivial changes:

1. `CURRENT_STATE.md`
2. `PROJECT_CONTEXT.md`
3. `DECISIONS.md`
4. `CURRENT_DEPLOYMENT.md`
5. `QA_HANDOFF.md`

Historical ADRs and reports under `docs/` and `reports/` remain valuable context, but the five files above describe the current handoff state.

## Product invariants

- The primary commercial wedge is **Vendor Exclusion Watch**: monitor a tenant's vendors/subcontractors against official SAM.gov active exclusions, preserve evidence, and surface changes.
- **Pursuit Watch** (opportunity discovery, fit scoring, Change Watch, Requirement Delta) remains a secondary module. Do not remove it unless explicitly requested.
- ExcluSignal is an **evidence and screening aid**, not a legal eligibility decision engine. Never rewrite product copy or behavior to imply a legal ruling.
- Identity matching order for exclusions must remain conservative:
  1. exact UEI + CAGE;
  2. exact UEI;
  3. exact CAGE;
  4. normalized legal-name-only -> possible match / human review;
  5. no match -> clear/no matching active record found.
- No LLM belongs in the critical exclusion determination path. Existing opportunity scoring and Requirement Delta logic are deterministic and auditable.
- Vendor Watch must work without a Company profile or NAICS. Company profile/NAICS primarily power Pursuit Watch.
- Tenant isolation is non-negotiable.
- Billing entitlements are enforced server-side, not merely in the browser.
- Production secrets never belong in Git, logs, generated reports, test fixtures, or prompts.

## Architecture invariants

- Runtime: Node.js 22+, ESM, intentionally minimal external dependency surface.
- Early production storage: SQLite on one writable persistent volume.
- Current supported topology: **one writable application replica**. Do not scale horizontally while SQLite is authoritative.
- Scheduler: single-process in-process scheduler with persistent idempotency state.
- Email: durable outbox + Resend adapter; verification/reset attempt immediate delivery first and retain retry path.
- Provider strategy: shared/bounded caches reduce upstream quota use. The SAM active-exclusions snapshot is shared across tenants.
- Production startup/readiness must fail closed when critical configuration is unsafe or incomplete.

## Git workflow

Before any task:

```bash
git status --short --branch
git remote -v
git log -5 --oneline
```

Rules:

- Never force-push.
- Never rewrite `main` history.
- For non-trivial work, create a descriptive branch such as `codex/<task>` unless the user explicitly requests a direct `main` commit.
- Keep commits cohesive and explain user-visible behavior in the message/body.
- Do not delete historical release artifacts merely to clean the repository.
- Do not commit generated production state, SQLite DBs, backups, outbox contents, credentials, or `.env` files.

## QA contract

The source-restored RC13 handoff has been validated with:

```bash
npm run release:gate
```

The release gate includes syntax checks, the Node test suite, auth/vendor/billing/change/requirement/scheduler/production/lifecycle smokes, and a secret scan.

For every behavior change:

- add/update a regression test when practical;
- run the narrow relevant test first;
- then run `npm run release:gate` before claiming release readiness;
- run `git diff --check` before committing;
- do not weaken a failing test just to turn the gate green. If copy/behavior intentionally changed, update the test to express the new requirement and explain why.

## Production safety

- Do not change Railway, DNS, Stripe live mode, Resend domain settings, or secrets unless the user explicitly asks for that external action.
- Do not claim a release is deployed from a successful build alone. Confirm the **effective runtime** and startup checksum/version in hosted logs.
- Railway `redeploy` has previously reused an old snapshot after service configuration changed. A new deployment must be confirmed by the expected runtime checksum/version, not by status alone.
- Preserve rollback ability to the previous known-good runtime until the new release is validated.

## Current migration priority

Source restoration and RC17–RC20 are complete. The operator reports RC20 production directly from GitHub main; RC21 profile-aware discovery is a separate candidate, not deployed. The historical restoration procedure below is retained for provenance, not an instruction to repeat reconstruction. Use release.json for source identity and CURRENT_DEPLOYMENT.md for effective production.

The public GitHub repository historically became a tarball-only deployment repository after the original source history stopped being pushed. The immediate priority is to make tracked source code the source of truth again **without changing production behavior**.

Use `CODEX_BOOTSTRAP.md` for the exact restoration procedure. Do not begin RC14 feature work until that restoration is committed and its full release gate is green.
