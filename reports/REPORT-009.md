# Committee Report 009 — Live SAM integration boundary and evidence extraction
Date: 2026-09-18

## Objective
Move Project Lantern from a mock-feed SaaS workflow to a production-shaped SAM.gov integration without exposing credentials or creating an API-cost/quota problem.

## Decisions made autonomously
1. Discovery metadata and opportunity-description enrichment are separate operations.
2. Shared discovery data remains cached across tenants.
3. Official descriptions are fetched only when a user chooses to analyze an opportunity.
4. Description retrieval occurs only server-side and only from allowlisted SAM API hosts.
5. Requirement extraction remains deterministic in this milestone; no paid LLM is added.
6. Extracted requirements are labeled as candidates and must be checked against the official notice/attachments.
7. Existing compliance rows are preserved; enrichment is additive, not destructive.

## Integration work
- Aligned normalized SAM fields to the public Opportunities v2 schema.
- Handles multiple documented response-deadline spellings defensively.
- Preserves description URL separately from text.
- Captures set-aside code/description, contacts, active state, resource links and place-of-performance fields.
- Added server-side description retriever with host allowlist.
- Added shared per-notice description cache, single-flight behavior and bounded stale fallback.
- Added deterministic requirement-candidate extraction using obligation/submission language.
- Added `/api/opportunities/:id/enrich`.
- Updated UI with explicit “Analyze official description” action and compliance warning.
- Added health visibility for credential configuration/expiry without exposing the credential.

## Credential / compliance finding
The user supplied an individual SAM.gov API key for the benchmark. A live call was attempted from the build runtime but outbound DNS/network access to `api.sam.gov` was unavailable (`EAI_AGAIN`), so authentication itself could not be validated here.

During the follow-up terms review, SAM.gov's published terms were found to prohibit sharing an individual API key and require API-key rotation every 90 days. The supplied key was therefore scrubbed from workspace files and was never committed, packaged, printed in reports or sent to client code. Production will require direct secret-manager injection rather than sharing a personal key in chat/source.

## QA finding and fix
The first end-to-end smoke test uncovered a regression: enrichment of a record whose embedded text yielded no new candidates could erase an existing compliance matrix. The service was changed to merge/deduplicate requirement rows instead of replacing them. A regression test was added.

## Validation
- 22/22 automated tests pass.
- Static Node syntax checks pass.
- Git-tracked secret scan reports zero findings.
- HTTP smoke test passes: register → save profile → rank opportunities → enrich top result → retain requirements → generate digest.
- Real SAM network validation remains an environment/deployment gate because this build runtime cannot reach `api.sam.gov`.

## Benchmark accounting
- Paid API spend required so far: $0.
- Human interventions required so far: 1 (obtaining/provisioning a SAM credential).
- External credential required for offline demo: 0.
- External credential required for live SAM feed: 1.
- LLM calls in critical scoring/enrichment path: 0.

## Commercial significance
On-demand enrichment is intended to preserve SAM quota while adding a monetizable workflow step: the user does not merely receive a link; Lantern turns official text into a reviewable compliance starting point with traceable source labeling. This creates more workflow value than undifferentiated opportunity search while keeping marginal API/AI cost low.
