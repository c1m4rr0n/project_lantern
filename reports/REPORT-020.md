# Report 020 — RC9 Trial, Entitlements and Stripe Billing Boundary

Date: 2026-09-18
Release candidate: 1.0.0-rc.9
Commercial product: ExcluSignal
Internal benchmark codename: Project Lantern

## Objective

Move ExcluSignal from a technically hosted pre-launch product toward a product that can actually charge, without pretending that a payment has occurred before a real Stripe account and test-mode lifecycle are connected.

RC9 therefore focuses on **authorization and billing boundaries**, not on adding another screening feature.

## Commercial hypothesis

The initial pricing is a validation experiment:

| Tier | Price hypothesis | Watched-vendor limit |
| --- | ---: | ---: |
| Trial | $0 for 14 days | 25 |
| Starter | $39/month | 50 |
| Team | $99/month | 500 |

These values are not revenue forecasts. They can be changed after real willingness-to-pay data exists.

## What was implemented

### Server-side entitlements

Billing state is tenant-isolated and persisted in SQLite/JSON storage.

- Trial starts from account creation and expires after 14 days.
- Vendor limits are enforced server-side, not only in the browser.
- Expired/inactive accounts keep read access to existing records and billing/account surfaces.
- Active workspace mutations and upstream monitoring actions require an active entitlement.
- Manual vendor screening, vendor mutations, opportunity sync/enrichment, market-context fetches and workflow writes are gated.
- The daily scheduler skips inactive tenants **before** provider work, avoiding unnecessary upstream calls.

### Stripe adapter

No Stripe SDK was added. A narrow REST adapter supports:

- hosted subscription Checkout Sessions;
- hosted Customer Portal sessions;
- tenant/plan reconciliation metadata;
- signed webhook verification using the raw request body and `Stripe-Signature`;
- HMAC-SHA256 constant-time comparison;
- five-minute timestamp tolerance to reduce replay risk;
- idempotent processed-event tracking;
- subscription create/update/delete state mapping.

Production readiness now requires `BILLING_PROVIDER=stripe` plus the Stripe secret key, webhook signing secret and Starter/Team recurring price IDs. `BILLING_PROVIDER=mock` remains available for offline/staging tests but deliberately fails a production readiness check.

### Public pricing surface

`/pricing.html` now exposes the validation tiers and can redirect an authenticated account to hosted Checkout/Customer Portal when Stripe is live. When billing is not connected, buttons explicitly show that the billing connection is pending rather than pretending a payment path exists.

## Important QA finding

The first implementation gated Vendor Watch but still allowed an expired tenant to invoke some secondary opportunity-provider actions manually. That would have been a real paywall bypass.

Before RC9 release, the server boundary was tightened so expired/inactive tenants can read existing history but cannot perform active workspace mutations or upstream monitoring actions. Scheduled work already had the same protection.

## First release-gate failure

The first full RC9 release gate failed at `smoke:lifecycle` after production readiness began requiring live billing configuration. The application behavior was correct; the lifecycle harness still represented the prior RC8 production shape and therefore could not become ready.

The harness was updated with production-shaped Stripe placeholders, rerun independently, then the **entire release gate** was repeated from zero.

## Final validation

- Automated tests: **79/79 PASS**
- Auth smoke: PASS
- Vendor Watch smoke: PASS
- Billing smoke: PASS
- Change Watch smoke: PASS
- Requirement Delta smoke: PASS
- Scheduler/restart smoke: PASS
- Production readiness smoke: PASS
- Process lifecycle smoke: PASS
- Secret scan: **152 files / 0 findings** before final report packaging
- `git diff --check`: clean

The billing smoke proves:

- active 14-day trial;
- 25-vendor trial entitlement;
- screening allowed during trial;
- hosted Checkout is not falsely exposed while Stripe is mock/unconfigured.

Unit coverage additionally validates expired-trial read-only behavior, vendor-limit enforcement, Stripe Checkout form construction, webhook signature verification, subscription mapping and event idempotency.

## What is deliberately **not** claimed

RC9 has **not** processed a real payment and has **not** generated MRR.

The following remain unvalidated externally:

1. Stripe account creation/identity requirements.
2. Real Stripe test-mode Product/Price creation.
3. Hosted Checkout completion.
4. Stripe webhook delivery to Railway.
5. Customer Portal session against the same customer.
6. Subscription cancellation/update and resulting entitlement change.
7. Live-mode billing approval.
8. Tax/accounting policy.

## Existing hosted evidence inherited from RC8/RC7

- Railway deployment is operational with persistent `/data` storage.
- RC8 commercial branding is live in Railway.
- SAM.gov Opportunities hosted preflight: HTTP 200.
- SAM.gov active-exclusions extract downloaded/parsed in Railway.
- Observed hosted exclusion snapshot: 8,283 active Firm records on 2026-09-18.
- LLM calls in critical path: 0.
- Required paid API spend for core data: $0.

## Decision

RC9 is acceptable as the **billing-ready software boundary**, but not as a paid public launch. The next commercial gate is external identity/infrastructure: domain + verified transactional email + Stripe test-mode configuration. A real billing lifecycle must pass before `NODE_ENV=production` is enabled for public onboarding.
