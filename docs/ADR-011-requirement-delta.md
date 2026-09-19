# ADR-011 — Requirement Delta as the commercial wedge

## Status
Accepted for 1.0.0-rc.6.

## Context
Competitive review showed that discovery, opportunity matching, pursue/skip scoring and amendment alerts already exist in multiple GovCon products. Project Lantern therefore should not position simple discovery or generic amendment notification as its primary differentiation.

The higher-value job is to explain the **impact of change on an active pursuit**:

- what requirement was added, removed or modified,
- whether it became mandatory,
- whether it matches a company-defined hard blocker,
- how the deterministic fit score moved,
- what exact source text caused the conclusion.

## Decision
Tracked opportunities (`reviewing` or `pursue`) establish a requirement baseline from the official SAM.gov description. Later description versions are compared deterministically.

The comparison algorithm:

1. exact normalized requirement matches are treated as unchanged;
2. remaining before/after requirements are paired greedily by token Dice similarity above a fixed threshold;
3. unmatched after requirements are `added`;
4. unmatched before requirements are `removed`;
5. paired non-identical requirements are `modified`;
6. company-defined `hardBlockers` are exact normalized phrase matches against added/modified requirement text;
7. fit impact is recalculated with the same deterministic opportunity scorer.

The first tracked description analysis creates a baseline and does **not** raise a change alert.

## Cost and reliability
Requirement descriptions use the existing shared SAM detail cache. A tracked sync checks the cached detail state; metadata change events force a fresh detail retrieval so amendment impact is not hidden behind a still-fresh cache entry. Across tenants, the cache is shared by notice ID.

No LLM is required in the critical path.

## Safety boundary
Extracted requirements remain machine-generated candidates and are marked `unverified`. Phrase matching to a hard blocker means "this source text matched a company-configured restriction," not a legal eligibility determination.

## Consequences
### Positive
- stronger product differentiation than generic amendment alerts;
- auditable before/after evidence;
- zero marginal LLM cost;
- deterministic tests and reproducibility;
- supports a high-value daily briefing for active pursuits.

### Negative / known limits
- wording similarity is deterministic rather than semantic-model based and may miss large rewrites;
- current RC6 monitors the SAM description text and public resource-link metadata, not the contents of every attached PDF/XLSX;
- hard blockers must be explicitly configured by the customer;
- legal/compliance review remains human responsibility.

## Next likely extension
Attachment-level delta: fingerprint/download permitted public attachments, extract text locally where practical, then feed versioned requirement candidates into the same Requirement Delta model.
