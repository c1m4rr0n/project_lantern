# ADR-013 — Commercial brand: ExcluSignal

Status: Accepted for RC8 pre-launch validation.

## Context

The internal codename `Project Lantern` was useful for the benchmark, but the product pivoted to continuous federal vendor-exclusion monitoring. A commercial name should communicate an exclusion signal without colliding with active adjacent products discovered during competitor review.

Names rejected during the review included VendorGuard, VendorProof, VendorTrace, ClearSub, GovSentry, SubWatch, ExclusionWatch, RosterProof and RosterGuard because active products already use them in vendor risk, compliance, subscription tracking or exclusion screening.

A web search on 2026-09-18 returned no relevant public product or indexed site for `ExcluSignal` or `exclusignal.com`. This is only a preliminary collision check; it is not trademark clearance and does not prove domain availability.

## Decision

Use **ExcluSignal** as the public product name in RC8 while retaining **Project Lantern** as the internal benchmark codename and repository history.

Public positioning:

> Federal vendor exclusion monitoring with evidence.

Preferred domain candidate: `exclusignal.com`, subject to registrar availability and trademark/legal review before purchase or public launch.

## Consequences

- Public UI and transactional email defaults use ExcluSignal.
- Provider user-agent strings identify ExcluSignal instead of the internal codename.
- Product name can be overridden with `PRODUCT_NAME` for white-label/testing without rewriting mail templates.
- Pre-launch pages remain `noindex,nofollow` until a controlled custom-domain launch.
- The internal Git repository and benchmark reports may still say Project Lantern for traceability.
