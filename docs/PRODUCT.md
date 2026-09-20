# ExcluSignal — product boundary

## Primary workflow

Federal contractors monitor their vendors/subcontractors against official SAM.gov active exclusions. Add identifiers manually or through confirmed CSV import, screen against a shared snapshot, preserve evidence, review alerts and export retained history. Vendor Watch does not require NAICS or a company profile.

Matching remains conservative: exact UEI+CAGE, UEI or CAGE supplies stronger identity evidence; legal-name-only matching is review-required. No matching record means only no match in that snapshot. Screening is decision support, not a legal eligibility determination.

## Secondary workflow

Pursuit Watch discovery requires usable company NAICS or capabilities (the profile remains optional for Vendor Watch). RC21 uses targeted SAM searches, bounded pagination and adaptive 30/90/180/365-day coverage. Results are locally scored; metrics distinguish evaluated records, profile matches, strong matches and attempted coverage. Capability-only profiles receive bounded title searches and a recommendation to add NAICS. Tracked opportunity changes and requirement candidates retain source evidence. Explicit customer hard-blocker phrases remain auditable. No LLM is used in these critical paths. See OPPORTUNITY_DISCOVERY.md for exact retention, freshness and safety limits.

## Commercial model

One account/tenant, no invitations or multi-user roles. Trial: 14 days / 25 active vendors. Starter: proposed $39/month / 50; Scale: proposed $99/month / 500, internal billing key team. Archived vendors retain evidence and do not occupy active slots. Inactive billing permits history/export but blocks active monitoring.

## Boundaries

No automatic legal determinations, autonomous bidding/pricing, CUI/export-controlled uploads or claims of approved legal policies. CSV import never automatically screens. Reports use real retained source evidence and do not fabricate missing fields. Multi-user collaboration and horizontal writable scaling remain future work.
