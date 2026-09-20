# RC20 professional product polish audit

Baseline: main `035f19448a59c52e6406b17508f03e7976c23ea6`, source/runtime RC19. Created before copy edits. Base release gate: 110/110 tests and all smokes/secret scan PASS. Scope is presentation; underlying security, matching, billing, storage and scheduling remain authoritative.

## Inventory and disposition

Reviewed static markup and generated strings in every public HTML/JS page, shared UI, auth/brief email templates, vendor CSV/report renderer and their API error inputs. User-entered names/notes, official SAM evidence, scores, requirements, timestamps and billing values are data, not copy to rewrite. Retain their exact values and escape on output. Safe generic errors replace unknown/internal details at the UI boundary; detailed API diagnostics remain unchanged.

| Screen | Current | Problem | Proposed | Priority |
|---|---|---|---|---|
| All workspaces | Repeated brand/nav/email/Sign out/Account headers | Inconsistent, crowded, clipped email | One responsive shell, active section, account dropdown | P0 |
| Navigation | Plan | Incomplete destination | Plan & Billing | P1 |
| Account menu | Account | Ambiguous | Workspace settings; Profile & data | P1 |
| Mobile navigation | Five tiny links always visible | Poor touch/reading targets | Menu disclosure with 44px targets, identity inside | P0 |
| Landing | Authenticated visitors remain on marketing page | Wrong entry | Verified session redirects to Vendor Watch | P1 |
| Landing | Product sample records without explicit demo label | Could appear real | Illustrative example — not live screening data | P1 |
| Landing | Brand, trial CTA, how-it-works, pricing, product boundary | Clear existing copy | Retain, including legal boundary | Keep |
| Auth title | ExcluSignal — Account | Confuses settings/access | ExcluSignal — Secure Access | P1 |
| Auth navigation | Back to site | Generic | Back to ExcluSignal | P2 |
| Registration | Create account / Create workspace | Inconsistent | Create your workspace | P1 |
| Auth proof | No card to create account | Awkward | No credit card required | P2 |
| Registration/reset | Single password field | Mistypes are silent | Confirm password/new password; show/hide; 10-character guidance | P0 |
| Registration success | Verification email sent | Destination unclear | State the submitted/returned email address | P1 |
| Login error | invalid_credentials | Internal code | The email or password you entered is incorrect. | P0 |
| Login error | email_verification_required | Internal code | Please verify your email before signing in. | P0 |
| Registration error | account already exists | Internal phrasing | This email is already associated with a workspace. Only map existing server disclosure | P1 |
| Reset/resend | If that account exists… | Enumeration protection | Preserve conditional, generic response | Keep |
| Verification | Redirecting to Vendor Watch | Correct destination | Retain; no redirect over active verify/reset token | Keep |
| Auth errors | Raw backend/network errors | Leaks jargon, poor recovery | Allowlisted human error messages; safe fallback | P0 |
| Vendor hero | Long acquisition headline in workspace | Weak operational hierarchy | Vendor Watch; concise evidence-oriented description | P1 |
| Vendor add | 402 redirects to pricing | Loses context/form | Inline Vendor limit reached, actual plan limit, View plans/Close | P0 |
| Restore | Error in CSV status area | Remote feedback | Cannot restore vendor, message in its archive card | P0 |
| Import | Preview CSV | Technical task framing | Review import | P1 |
| Import summary | valid / invalid / duplicate rows text | Hard to scan | Total / Ready / Duplicate / Needs attention cards | P1 |
| Import row | Row 6 — invalid | No useful explanation | Field-level guidance and ready/duplicate/invalid badges | P1 |
| Import duplicate | Already exists or repeated in file | Source ambiguous | Already in your watchlist / Already archived / Duplicate within this file | P1 |
| Import parser | Unclosed CSV quote | Bare diagnostic | We couldn't read this CSV. Check for an unclosed quotation mark and try again. | P1 |
| Import | Confirm selected valid rows | Selection/capacity unclear | Import N vendors; slots available vs selected | P0 |
| Import success | Reload watchlist | Extra work | Automatic shared refresh, saved-but-refresh-failed fallback | P0 |
| Archive | Native confirm | Browser-generic | Branded dialog: stop monitoring, preserve history, cancel/archive | P1 |
| Vendor screen | Screen now after previous screen | No state recognition | Run screening again | P2 |
| Vendor source | sam-extract · hit/refresh/stale | Provider/cache jargon | SAM.gov data · Updated today/date / Refreshing / Refresh due | P1 |
| Vendor source | STALE SNAPSHOT | Important warning | Retain conspicuous stale-snapshot warning, never call stale current | Keep |
| Vendor exports | Export below full roster | Hard to find | Export CSV beside watchlist header | P1 |
| Vendor empty | No vendors watched yet | Needs action | Add a vendor or review a CSV import; identifiers improve evidence | P2 |
| Vendor states | ACTIVE EXCLUSION / POSSIBLE MATCH / NO MATCH | Legal semantics intentional | Preserve meaning; possible match requires review | Keep |
| Pursuit | Startup error / native alerts | Debug-style errors | Could not load Pursuit Watch; inline action feedback | P1 |
| Pursuit | cache hit / sam / mock | Internal terms | SAM.gov opportunities / Sample opportunities; retrieved date | P2 |
| Pursuit list | Click-only cards | Keyboard inaccessible | Focusable selectable cards with keyboard activation | P0 |
| Pursuit | Decision states, scores, change and requirement evidence | Meaning-bearing | Preserve all semantics and source evidence | Keep |
| Daily Brief/email | Vendor eligibility watch/alerts | Can imply eligibility decision | Vendor Exclusion Watch / screening alerts | P1 |
| Daily Brief/email | EXCLUDED / POSSIBLE-MATCH | Raw enum | Active exclusion / Possible match — review required | P1 |
| Daily Brief | Empty brief on request failure | No recovery | Inline loading/error state | P1 |
| Company | Hard blocker instead of hiding logic behind an AI score | Unnecessary AI comparison | Explicit configured blocker with source evidence | P2 |
| Company | Optional NAICS/profile guidance | Accurate boundary | Retain optional-for-Vendor-Watch guidance | Keep |
| Company | Raw save error | Jargon | Human validation and recoverable save failure | P1 |
| Plans | reason=limit without explanation | Lost navigation context | You've reached your current vendor limit. | P1 |
| Plans | same tenant / account | Internal vocabulary | Your workspace and screening history | P2 |
| Plans | Small teams | Implies membership model | Smaller vendor rosters | P1 |
| Plans | Trial day(s), raw status | Mechanical | Singular/plural days and human access status | P2 |
| Settings | Account and data | Generic, danger dominates | Workspace settings: profile, export, billing, security, danger zone | P1 |
| Deletion | Native confirm | Weak consequence presentation | Accessible final dialog; retain password and DELETE | P0 |
| Report | Unstyled Source matches [] | Looks like debug dump | Professional evidence artifact; explicit no-records statement | P1 |
| Report | Confidence high for no match | Could imply eligibility confidence | Only display match confidence where matches exist | P0 |
| Report | Raw dates only | Hard to read | UTC localized display with original timestamps retained | P2 |
| Report | Missing generated time / weak print hierarchy | Hard to file | Generated time, status block, identity, snapshot, evidence, review, footer | P1 |
| Report | Raw match JSON | Full evidence must survive | Labeled match fields preserving every field/value | P1 |
| Emails | Verify/reset subject, expiry, one-time, ignore-if-not-you | Security-critical and clear | Retain link/expiry/generic security semantics | Keep |
| Errors/confirmation | Undefined/raw code defaults | Unhelpful | Contextual allowlist + retry/support guidance without secrets | P0 |

## Approved-consistent vocabulary

Vendor Watch is the default workspace; Pursuit Watch is secondary. Use Plan & Billing, Workspace settings, Profile & data, active vendors, screening, evidence, review-required and Archive/Restore. Do not call no match eligible, approved, cleared, or guaranteed compliant. No membership/invitation claims. This audit adopts the vocabulary requested for RC20, not a new business/legal policy.

## Verification to record before handoff

Regression coverage: entry redirects/token exceptions; password mismatch prevents POST; errors/capacity are contextual; selection/duplicates/capacity review; archive/restore/import refresh; report escaping and evidence retention; existing tenant isolation. Local responsive inspection at 360, 390, 430, 768, 1024, 1440, including long identities and 25+ cards. CI required on Ubuntu/Windows; no automatic merge or production smoke.
