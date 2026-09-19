# Project Lantern — Product boundary

## ICP
US federal small-business contractors with roughly 5–50 employees and a small business-development/capture function that cannot justify a large enterprise GovCon stack.

## Job to be done
“Once I decide an opportunity matters, tell me exactly what changed, what requirement changed, whether it creates a blocker for my company, and what needs review before we keep spending proposal time.”

## Commercial wedge
**Pursuit Change Intelligence with evidence and impact.**

Discovery and initial qualification bring a contractor into Lantern. The retained value is monitoring active pursuits and converting amendments into a before/after decision layer:

1. material metadata delta,
2. requirement delta,
3. company-specific hard-blocker detection,
4. fit-score delta,
5. source evidence and review acknowledgement.

## RC6 promise
For tracked opportunities, Lantern establishes a requirement baseline from the official SAM.gov description. Later versions are compared deterministically. Added, removed and modified requirement candidates are shown separately. Company-defined hard-blocker phrases can force a `skip` result with the exact triggering evidence visible.

## Why this is not just an amendment alert
An amendment alert answers **“did something change?”** Lantern is designed to answer:

- what changed,
- what requirement changed,
- whether it became mandatory,
- whether it matches a company-defined blocker,
- how the fit score/recommendation moved,
- what source text caused that conclusion.

## Not building in the MVP
- automated bid submission
- autonomous legal eligibility determinations
- autonomous pricing
- proposal ghostwriting as the core product
- contact-data brokerage
- state/local portal scraping at scale
- CUI/export-controlled document handling

## Safety / product boundary
Requirement extraction is a machine-generated candidate layer. It is not a legal interpretation of the solicitation. Lantern should preserve source evidence, mark extracted requirements as unverified and keep consequential representations under human control.
