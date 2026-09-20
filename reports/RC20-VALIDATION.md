# RC20 professional product polish — validation

Date: 2026-09-19 (operator timezone; final local runs extend into 2026-09-20 UTC).
Branch: `codex/rc20-professional-product-polish`.
Base: `035f19448a59c52e6406b17508f03e7976c23ea6` from fetched origin/main.
Source version: `1.0.0-rc.20`. Production remains operator-confirmed RC19 at `2c09f7df4601048dd602e77e486e85dd27943d5d`.

## Safety and scope

Origin was verified as `c1m4rr0n/project_lantern`; tracked working tree was clean before implementation. Pre-existing untracked `_handoff/` was preserved and excluded. No work was performed directly on main. The baseline release gate passed 110 tests before edits. Instructions/context/security/pipeline documents and existing implementation/tests/history were inspected before changes.

No Railway, DNS, secrets, Stripe Live, production variables/data or repository settings were changed. No production smoke, real SAM request, card charge or account deletion against a real account was performed. Historical RC artifacts are untouched. This candidate must be reviewed and is NOT authorized for automatic merge/deployment.

## Implemented presentation and entry behavior

- Shared dependency-free shell in `public/ui.js`: active primary section, desktop account disclosure, mobile navigation with identity, Escape/outside/focus-departure closing, skip link and visible focus. All six workspace pages use it.
- Verified root/index/auth entry redirects to Vendor Watch, excluding verification/reset parameter flows. Public unauthenticated entry and all server auth checks remain intact.
- Registration/reset confirmation prevents mismatched POSTs; show/hide and password guidance; explicit verification destination; allowlisted human errors and generic recovery responses.
- Shared accessible confirmation dialog, contextual capacity notices and badges. No native browser confirms remain in public scripts. Destructive deletion still requires password and DELETE.
- Vendor Watch: top Add/Import/Export actions, responsive cards and touch-sized grouped actions, repeat-screen labels, source freshness wording retaining stale warnings, inline capacity errors and live counters/watchlist/archive/entitlement refresh.
- CSV review: summary cards, ready selection, existing/archived/in-file duplicate explanations, row guidance, capacity-aware commit button, explicit confirmation, no auto-screen, responsive table/cards, saved-but-refresh-failed recovery.
- Workspace settings groups profile, billing, security, export and danger zone. Company/Daily Brief/Pursuit errors have recoverable customer-facing presentation.
- Print evidence: brand, identity, generated/screened times, exact source filename/date/hash, retained match fields, acknowledgement/review and unchanged legal footer. No-match copy replaces empty JSON; confidence is displayed only for matches. Long retained history is allowed to paginate.
- Copy inventory and decisions: `docs/RC20_POLISH_AUDIT.md`, created before copy edits. Includes navigation, auth, roster/import, plans, settings, emails, reports, errors, empty states and confirmations. Documentation now distinguishes source candidate RC20 from production RC19 and records operator-confirmed Watch Paths.

## Automated validation

Local Node 22.23.2 / Windows:

| Check | Result |
|---|---|
| Baseline release gate | PASS — 110 tests, all smokes, secret scan |
| RC20 Node test suite | PASS — 121 tests, 0 failures/skips |
| Syntax/version consistency | PASS |
| Auth HTTP smoke (including new entry redirects/token exceptions) | PASS |
| Vendor Watch / billing / Change Watch / Requirement Delta smokes | PASS |
| Scheduler / production-readiness / lifecycle smokes | PASS |
| Commercial smoke: tenant isolation, import, archive history, export reauth, deletion | PASS |
| Full `npm run release:gate` | PASS |
| Secret scan | PASS — 0 findings |
| `git diff --check` | PASS |

New regressions cover registration/reset mismatch without POST, safe error mapping, duplicate classifications, malformed CSV guidance, real entitlement capacity, stale source wording, report evidence/escaping semantics, shared confirmations, inline 402 without form loss/redirect, and archive/review refresh of counters and archive state. Existing matching, tenant, entitlement, retention, scheduler/outbox and lifecycle tests remain in the gate.

## Local browser and responsive evidence

`scripts/qa-polish-browser.js` runs only against its own loopback mock application and temporary SQLite root. It uses workstation-provided Playwright and Chrome; no dependency was added to package.json and no remote base URL is supported. It is an optional QA script, not silently included in dependency-free CI.

- PASS: 48 page/viewport checks — Vendor Watch, Pursuit Watch, Daily Brief, Company, Plan & Billing, settings, guest landing and auth at **360, 390, 430, 768, 1024, 1440** pixels.
- PASS: zero horizontal page overflow across those combinations, long signed-in identity, menu disclosure/close and zero uncaught page errors.
- PASS: 25 active vendors, screen/re-screen label, archive cancel/confirm, dialog initial focus and Tab/Shift+Tab containment, Escape, archive/restore live counts with preserved screening history.
- PASS: CSV over-capacity disabled, explicit import confirmation, automatic 23→25 roster update, restore-at-capacity feedback in archive card (not CSV status), add-at-capacity stays on Vendor Watch, malformed CSV guidance, registration/reset mismatch with zero POSTs, password visibility toggle.
- CSV review screenshots at all six widths; viewport and full-page screenshots for workspace/public pages. Visual samples inspected: mobile/desktop roster, mobile/tablet import, settings, auth and report.
- Browser-generated simple/no-match A4 report: **1 page** confirmed by pdfinfo and visually checked after Poppler rendering. Evidence is clearly mock/local; this does not certify live SAM freshness or a real report.

Evidence files are intentionally outside Git at the task workspace `work/rc20-qa/`: `results.json`, `{width}-vendor-viewport.png`, `{width}-import-review.png`, `{width}-{page}.png`, `report.png`, `report.pdf`. They contain only disposable local fixture data. The temporary application database is removed when QA exits.

Two QA-harness setup assumptions were corrected after investigation: test-mode server intentionally does not listen (use isolated local development mode); the existing archive endpoint correctly returns 200, not 204. Application behavior and API assertions were not weakened to conceal product failures.

## CI / merge boundary

The protected workflow is unchanged. The PR must run exact checks `release-gate (ubuntu-latest)` and `release-gate (windows-latest)`. Ubuntu additionally builds Docker and checks production-shaped container readiness. Their final per-commit results are recorded on the PR and in the implementation handoff after push; local success is not a claim of remote CI success. Do not merge automatically.

## Human review still required

- Real iOS Safari / Android browsers, screen reader navigation (VoiceOver/NVDA), OS zoom/text scaling, and subjective typography/copy acceptance. Headless Chrome viewport checks are not physical-device or assistive-technology certification.
- Actual email-client rendering, live provider delays/stale-source scenarios and the paused disposable-account production smoke require a separately authorized session.
- Print review of real match-heavy/multi-screening history and browser-specific PDF/printer pagination. Simple mock one-page output is verified; arbitrarily long history must not be truncated to one page.
- Final PR review and explicit merge instruction. RC20 is not published to production by this task.

## Intentionally unchanged

Exact UEI/CAGE/name-only matching and review requirements, tenant isolation, server entitlements, CSV parser/canonical validation/fingerprints, import no-auto-screen, archive/evidence retention, reauthentication/deletion rules, billing plan keys, Stripe state, scheduler/outbox idempotency, SQLite single-writer architecture, fail-closed readiness, noindex defaults and legal meaning are preserved. Backend changes are limited to the requested authenticated entry redirect and report/email presentation; no production business rule was relaxed.

## Pre-merge shell refinement

The account trigger is now only a circular initial and subtle chevron. Email, workspace/profile/billing actions and sign-out remain inside the disclosure; there is no permanent Account/Workspace label. Equal desktop side columns center primary navigation independently of the brand/account widths; account/nav controls align at 44px. Shell links and avatar inherit shell typography without browser-default underlining. Tablet/mobile retain brand, current section and a single Menu trigger.

Expanded browser QA detected a focus timing bug in the previous microtask-based focusout handler: Tab could close the menu before the next item received focus. The handler now uses the focus event's relatedTarget; keyboard traversal, Escape/focus return, outside click and screen-reader labels were rechecked on all six workspace pages at all six widths.

- Full local Node 22 release gate: PASS, **122/122 tests**, all smokes and secret scan (0 findings).
- Responsive browser rerun: PASS, **48 page/width checks**, no horizontal overflow or page errors; 36 authenticated shell checks include open/closed state, hidden top-bar identity, 44px controls, keyboard entry/Tab/Escape/outside close. Desktop QA verifies true viewport-centered nav and matching account/nav control heights and font families.
- Fresh evidence in the task workspace `work/rc20-shell-qa/`: `{360,390,430,768,1024,1440}-shell-closed.png` and corresponding `-shell-open.png`, plus refreshed full-page/viewport captures and `results.json`. All six closed shell captures and mobile/desktop open menu captures were visually inspected. Evidence uses disposable local fixtures, not production.
- Changes stay on the existing RC20 branch/PR #4. Latest remote CI results are recorded per commit on that PR; do not infer them from the earlier 121-test run. No merge or Railway/production action is authorized or performed.
