# Committee Report 008 — Pursuit decision workflow
Date: 2026-09-18

## Objective
Turn opportunity ranking into a repeatable daily workflow instead of a passive search result list.

## Implemented
- Tenant-specific opportunity decisions: `new`, `reviewing`, `pursue`, `pass`.
- Internal notes per opportunity.
- Decision persistence isolated by tenant.
- Feed badges and action controls.
- Dashboard count for active pursuits.
- Morning digest excludes opportunities explicitly passed by the tenant.
- Digest reports pursue/pass counts so the queue reflects actual work state.

## Why it matters commercially
A ranking tool is easy to sample and abandon. Persisted pursuit decisions create workflow state, make the next session more useful than the first, and provide a foundation for reminders, team approvals and future personalization without requiring an LLM in the critical path.

## Validation
A complete HTTP flow registered a workspace, created a company profile, loaded ranked opportunities, marked the top result as `pursue` with a note, and confirmed that both the feed and digest reflected the stored decision.

## Automated coverage
Two new tests cover decision validation and digest suppression of passed opportunities. Tenant isolation coverage was extended to verify decisions do not cross workspace boundaries.

## Result
16/16 automated tests pass. Required paid API spend remains $0.
