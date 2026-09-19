# ExcluSignal — Current State at Codex Handoff

**Handoff date:** 2026-09-19 (Puerto Rico)
**Live release:** `1.0.0-rc.13`

## What is live now

RC13 is running on Railway behind `exclusignal.com` and the hosted startup log verified the exact RC13 runtime SHA-256:

`ccc76e2ea030db71ef787bd1691e2defd73ec95b705dfbdda4e26b9e26ef19d1`

The live service uses SAM providers + SQLite storage + in-process scheduler on a persistent `/data` volume.

## RC13 purpose

RC13 fixed a real mobile presentation defect from RC12: browsers could combine new HTML with an older cached `styles.css` because static assets reused stable names without an explicit beta cache policy.

RC13 therefore:

- serves static beta assets with `Cache-Control: no-store, max-age=0`;
- versions browser asset references with `?v=rc13`;
- reorganizes the mobile application header;
- keeps the signed-in account visible;
- adds a first-use Vendor Watch guide;
- explicitly states that Vendor Watch does not require NAICS/company profile;
- clarifies that Company profile primarily powers Pursuit Watch;
- improves verification/resend feedback;
- refreshes the favicon.

No intended SAM exclusion matching, Stripe entitlement, tenant isolation or persistence behavior was changed by RC13.

## Hosted visual QA

Post-deployment mobile screenshots confirmed that the stale/mixed CSS problem is resolved. The public landing page and authenticated Vendor Watch shell render coherently on Android.

RC14 polish candidates after source restoration:

- normalize `ExcluSignal` capitalization everywhere;
- reduce mobile workspace-nav density;
- move `Screen all` into Vendor Watch content hierarchy;
- improve the plan/usage presentation;
- compact the legal notice while retaining it;
- reduce form field vertical height on mobile;
- reduce Vendor Watch hero headline size on small screens;
- show `Not screened yet` instead of `—` for an empty source snapshot.

## Repository problem to solve before RC14

The public GitHub repository currently tracks release tarballs/checksums but not the full current source tree. Earlier development source/history exists in a complete Git bundle through RC10.

This handoff includes:

- `project-lantern-history-1.0.0-rc.10.bundle` — complete original Git history through RC10;
- `project-lantern-rc13-source-reconstruction.tar.gz` — reconstructed full source tree using RC10 history plus the exact RC13 runtime overlay and updated UI tests;
- `rc10-to-rc13-source-reconstruction.patch` — reviewable patch from RC10 source to the reconstructed RC13 source state.

The reconstructed tree was validated before handoff. See `QA_HANDOFF.md`.

## Recommended immediate sequence

1. Restore tracked source into the current public repository on a feature branch using `CODEX_BOOTSTRAP.md`.
2. Run the full release gate and review the diff.
3. Merge source restoration without changing production deployment behavior.
4. Separately migrate Railway from tarball bootstrap to tracked GitHub source deployment.
5. Validate the source-based deployment against RC13 behavior.
6. Only then start RC14 UX work.

## Remaining broader launch gates

- external uptime/error monitoring;
- independent/off-volume disaster recovery;
- Stripe live onboarding and real paid-customer lifecycle before claiming live revenue;
- privacy/terms/tax/business/legal review appropriate to launch;
- formal trademark review;
- willingness-to-pay validation with real contractors;
- Postgres/worker architecture before horizontal application scaling.
