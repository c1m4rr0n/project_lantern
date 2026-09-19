# ADR-015 — Paid-beta hardening after hosted lifecycle

Status: Accepted for RC10 validation.

## Context

The first full hosted customer journey exposed several issues that unit tests alone did not: verification email latency from the scheduled outbox interval, a generic onboarding failure message, legacy demo opportunity fixtures visible in a live-SAM tenant, internal RC labels in public UI, and a missing favicon. The same hosted test successfully exercised Resend and Stripe sandbox Checkout/webhook/portal/cancel-at-period-end.

## Decision

1. Authentication emails use the same durable outbox, but when the configured provider is Resend the request path immediately attempts delivery of the just-queued file. Failure leaves the message queued for the scheduler.
2. Request-path and scheduler email delivery coordinate through an in-memory claim because the supported SQLite launch topology is one writable process.
3. New verified users enter Vendor Watch. Pursuit profile setup is optional and its validation errors are shown verbatim from the safe server response.
4. Mock opportunity fixtures are permitted only in mock mode. Live providers filter and purge explicit internal demo rows.
5. Public pages show a generic Beta badge rather than internal release-candidate identifiers.
6. Billing UI shows cancel-at-period-end dates when Stripe reports them.

## Non-claims

RC10 does not claim real revenue, live Stripe charges, final subscription-deletion validation, legal/tax readiness, formal trademark clearance, off-volume disaster recovery, or horizontal scale readiness.
