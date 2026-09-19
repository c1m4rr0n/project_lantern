# ADR-012 — Vendor Exclusion Watch as the primary commercial wedge

## Status
Accepted for 1.0.0-rc.7.

## Context
RC6 proved that Lantern can discover opportunities, track pursuits, compare amendments and explain requirement impact. A second competitive review showed that discovery, generic amendment monitoring, proposal compliance and pursuit scoring are already served by several GovCon products. Continuing to compete mainly on those features would increase build scope while pushing Lantern toward a feature-and-price war.

A narrower operational problem reuses most of the existing platform while creating a clearer recurring workflow: a federal contractor may need to know whether a supplier or subcontractor appears in SAM.gov active exclusion records, retain evidence of the screening, and notice when that status changes.

The official SAM.gov Public Exclusions Extract is produced daily and contains all currently active exclusions. Current FAR 9.405 and 9.405-2 make active exclusions relevant to federal contracting and certain subcontracting decisions, but the effect of a record depends on the basis and conditions of the exclusion. Lantern therefore must monitor and surface evidence without making a legal eligibility determination.

## Decision
Make **Vendor Exclusion Watch** the primary RC7 product loop:

1. A verified tenant adds vendors/subcontractors using legal name and, where available, UEI and/or CAGE.
2. Lantern downloads one shared daily Public V2 exclusions snapshot from SAM.gov and stores its source date, filename and SHA-256.
3. Only active `Firm` records are indexed for this vendor-screening workflow.
4. Exact UEI and/or CAGE matches produce a high-confidence `excluded` product state, displayed to users as **ACTIVE EXCLUSION**.
5. A legal-name-only match produces `possible-match`, never an automatic exclusion determination.
6. No match produces `clear`, meaning only that no matching record was found in the active snapshot.
7. The first screen establishes a baseline. Later status/evidence changes create an auditable alert.
8. Screening history is retained per tenant and alerts can be acknowledged.
9. The daily scheduler shares one snapshot across all tenants and does not fetch the opportunities feed for vendor-only tenants.

Opportunity discovery, Change Watch and Requirement Delta remain in the product as a secondary procurement-intelligence module.

## Identity and false-positive policy
Identifier evidence is intentionally stronger than name evidence:

- exact UEI + CAGE: strongest evidence;
- exact UEI or exact CAGE: high-confidence identity match;
- normalized legal name only: review required;
- no match: no active-extract match found, not a legal certification.

Name normalization exists to help reviewers find likely records, not to substitute for entity identity.

## Cost model
The snapshot is shared across customers. The number of watched vendors does not create one upstream SAM request per vendor. With the normal cache window, Lantern can refresh approximately once per day and screen locally from the downloaded snapshot.

This is important because a basic non-Federal personal SAM API key without a role is documented with a low daily request allowance. Shared snapshot ingestion keeps early-stage unit economics compatible with that constraint.

## Auditability
Each screening can retain:

- screening timestamp;
- vendor identity supplied by the customer;
- match type and confidence;
- non-sensitive exclusion fields returned by the extract;
- source extract date and filename;
- SHA-256 of the downloaded snapshot;
- cache/stale state;
- acknowledgement state.

The system never stores the SAM API key in the screening evidence.

## Safety / legal boundary
Lantern is a monitoring and evidence tool, not legal advice and not a Government determination of responsibility or eligibility.

An active SAM exclusion can have different legal effects depending on the exclusion authority and context. Customer workflows must therefore treat Lantern's status as a screening signal and review the underlying official record when consequential action is required.

## Consequences
### Positive
- narrower and more recurring B2B job than generic opportunity discovery;
- high automation and low marginal upstream cost;
- deterministic matching and strong testability;
- shared official source rather than proprietary data purchase;
- natural audit/history value that improves retention;
- reuses auth, tenants, scheduler, email, backups, health checks and Railway infrastructure already built.

### Negative / known limits
- exact identity depends on customers supplying UEI/CAGE when possible;
- legal-name-only matching can create false positives and therefore requires review;
- a snapshot outage can make data stale, which must remain visible in the UI;
- the Public Exclusions Extract is not a substitute for professional legal/compliance review;
- live hosted extract refresh still needs to be validated in Railway for RC7.

## Source references reviewed 2026-09-18
- GSA SAM.gov Entity/Exclusions Extracts Download API: https://open.gsa.gov/api/sam-entity-extracts-api/
- FAR 9.405 — Effect of listing: https://www.acquisition.gov/far/9.405
- FAR 9.405-2 — Restrictions on subcontracting: https://www.acquisition.gov/far/9.405-2
- FAR 52.209-6 — Protecting the Government's Interest When Subcontracting: https://www.acquisition.gov/far/52.209-6
