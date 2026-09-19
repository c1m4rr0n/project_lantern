# Report 019 — RC8 Commercial Identity and Launch Readiness

Date: 2026-09-18
Release candidate: 1.0.0-rc.8
Internal codename: Project Lantern
Commercial product name: ExcluSignal

## Objective

Move the validated Vendor Exclusion Watch product from an internal benchmark codename toward a coherent commercial identity without changing the core risk engine or adding paid dependencies.

## Naming decision

The public name selected for RC8 is **ExcluSignal**.

The naming review deliberately rejected names already used by active adjacent products, including VendorGuard, VendorProof, VendorTrace, ClearSub, GovSentry, SubWatch, ExclusionWatch, RosterProof and RosterGuard. Exact web searches on 2026-09-18 found no relevant indexed product/site for `ExcluSignal` or `exclusignal.com`.

This is a preliminary collision check only. It is **not** legal trademark clearance and does **not** prove that `exclusignal.com` is currently registrable. Domain registration and trademark review remain human/legal launch gates.

## Product positioning

Primary statement:

> Federal vendor exclusion monitoring with evidence.

Landing-page promise:

> Know when a vendor becomes a federal exclusion risk — with evidence.

The product continues to use deterministic UEI/CAGE/name matching, preserves source snapshot evidence, alerts on state changes and keeps opportunity/pursuit intelligence as a secondary module.

## Implementation

- Public HTML rebranded from Project Lantern/Lantern to ExcluSignal.
- `PRODUCT_NAME` runtime configuration added for transactional email and process identity.
- Auth verification/reset emails now inherit the commercial product name.
- Daily digest subjects/body now inherit the commercial product name.
- SAM/USAspending User-Agent strings now identify ExcluSignal.
- Internal repository/history still use Project Lantern for benchmark traceability.
- Pre-launch pages use `noindex,nofollow` to avoid indexing the temporary Railway hostname before a custom-domain launch.
- Deployment documentation now specifies `PRODUCT_NAME=ExcluSignal`.
- ADR-013 records the brand decision and its limitations.

## Regression gate

- Automated tests: **71/71 PASS**
- Auth smoke: PASS
- Vendor Watch smoke: PASS
- Change Watch smoke: PASS
- Requirement Delta smoke: PASS
- Scheduler/restart smoke: PASS
- Production readiness smoke: PASS
- Process lifecycle smoke: PASS
- Secret scan: **142 files / 0 findings**
- `git diff --check`: clean

Two new tests specifically cover commercial branding and prevent the internal codename from leaking into public UI.

## Current live evidence inherited from RC7

- Railway deployment: operational
- Persistent `/data` volume: operational
- SAM Opportunities connectivity: HTTP 200 in hosted preflight
- SAM Public V2 active-exclusions extract: hosted download/parse PASS
- Hosted exclusion snapshot observed on 2026-09-18: 8,283 active firm records
- Required paid API spend: $0
- LLM calls in critical path: 0

## Human interventions

The benchmark now counts **5 required human interventions so far**, including external-account/credential authorization and manual GitHub artifact uploads forced by connector write limitations. Repeated manual artifact uploads are counted rather than hidden.

## Remaining launch gates

1. Verify/register a custom domain (preferred candidate: `exclusignal.com`).
2. Configure DNS and Railway custom domain.
3. Create/authorize a transactional email provider and verify sender domain.
4. Switch `EMAIL_PROVIDER` from console to Resend and set `EMAIL_FROM`.
5. Move runtime from staging to production readiness mode.
6. Add billing and validate a real payment lifecycle.
7. Add production monitoring and off-volume disaster recovery.
8. Obtain appropriate trademark/legal review before treating ExcluSignal as cleared for broad commercial use.

## Decision

RC8 is acceptable for pre-launch deployment. It does not yet qualify as a paid public launch because domain ownership, real transactional email and billing are not live.
