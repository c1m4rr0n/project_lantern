# ExcluSignal / Project Lantern — project context

Public product: ExcluSignal. Engineering repository: c1m4rr0n/project_lantern. Production domain: exclusignal.com.

Vendor Exclusion Watch is the primary commercial wedge. Pursuit Watch and Daily Brief remain secondary/complementary. See docs/PRODUCT.md for current scope and DECISIONS.md for invariants.

Tracked source was restored through RC13. RC14/15 improved mobile/desktop accessibility and form reliability; RC16 restored cached SAM metadata across restart. RC17–RC19 adds operational, onboarding and account/commercial hardening; RC20 polishes the shared shell and workflows. release.json describes RC21 candidate source; CURRENT_DEPLOYMENT.md records operator-reported RC20 production/main at afdff08fa87012fb2d35167bc9a06d7b6355021e. Historical RC16 bootstrap evidence is not the current deployment mechanism.

RC21 adds deterministic profile-aware opportunity discovery with bounded pagination/adaptive horizons, exact-query public page caching and tenant-local summaries. No generic sync for an empty profile. Vendor Watch still needs no Company profile. See docs/OPPORTUNITY_DISCOVERY.md for stop/retention rules and optional tuning; existing scoring and tracked-pursuit evidence semantics remain unchanged.

Runtime is Node 22+ ESM with native SQLite and no mandatory npm dependencies. One writable process, one persistent /data volume, in-process scheduler, shared provider caches and durable email outbox. JSON storage remains supported for testing. Native HTTP APIs and static modules live in server.js, src and public.

One account equals one tenant. Scale is a capacity tier, not multi-user collaboration; internal key team is preserved. Authentication, entitlement enforcement, tenant separation and deterministic evidence-first matching are non-negotiable. No LLM belongs in screening/scoring/requirements. No CUI or export-controlled input is supported.

Historical hosted evidence includes SAM connectivity/extract parsing, Resend delivery, Stripe sandbox Checkout/Portal/cancel-at-period-end and RC16 health. These are dated observations, not claims that new branch code or provider integrations are deployed/verified.

The branch must not alter Railway, Stripe Live, DNS, repository visibility or legal-publication status. Source deployment, independent backup restore, external alert delivery, legal/business approval and willingness-to-pay validation remain separate external gates.
