# Committee Report 002 — Competitive correction and market-context milestone
Date: 2026-09-18

## New external evidence
A current competitor review shows that broad GovCon search is already well served. HigherGov publicly lists a $500/year Starter tier, GovTribe lists $1,900/year for its entry federal+SLED plan, and GovDash spans discovery through proposal/contract workflows with sales-led pricing. This means a generic “search SAM.gov better” product is not sufficient.

## Product narrowing
Lantern is being narrowed to a self-service **qualification layer for small contractors**:
- very short ranked morning feed;
- explicit match reasons and blockers;
- compliance matrix;
- historical award signal for the opportunity's NAICS;
- evidence links to official sources;
- bilingual UX later, but no broad CRM/proposal suite in the MVP.

The aim is to sell speed of decision, not access to public data.

## Milestone 0.2
Added a provider adapter for USAspending historical award data. USAspending's current endpoint catalog states that its endpoints do not require authorization. The live adapter is separated from an offline demo fixture so the benchmark can run with no credentials and later switch to real data without changing the UI.

## Cost impact
Still $0 in required API spend for the runnable demo. SAM live sync will require a free API key; USAspending requires no authorization at present.
