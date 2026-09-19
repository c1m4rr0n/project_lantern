# ADR-014 — Server-side trial entitlements and Stripe billing boundary

Date: 2026-09-18
Status: Accepted for RC9 validation.

## Context

ExcluSignal had a hosted product, account system, exclusion screening and scheduled automation, but no enforceable commercial boundary. Adding payment buttons without server-side authorization would create a false monetization milestone: a user could still call the underlying APIs after a trial or payment state changed.

The launch target also favors a small operational surface. The benchmark should avoid adding a full billing SDK if the required Stripe operations can be isolated behind a narrow adapter and tested deterministically.

## Decision

RC9 introduces an internal billing state per tenant and server-side entitlements.

- New accounts receive a 14-day trial with a 25-vendor limit.
- Starter validation price: $39/month, 50 watched vendors.
- Team validation price: $99/month, 500 watched vendors.
- These prices are hypotheses for willingness-to-pay validation, not revenue forecasts.
- An expired/inactive tenant keeps read access to existing history and billing/account pages, while active workspace mutations and upstream monitoring actions are blocked.
- The scheduler checks entitlements before doing tenant-specific upstream work.
- Billing state persists in the same tenant-isolated storage boundary as the rest of the account state.

Stripe is implemented behind a zero-dependency provider adapter:

1. Server creates a hosted Checkout Session in `subscription` mode.
2. Tenant ID and plan key are carried in Stripe metadata/client-reference fields for reconciliation.
3. Existing Stripe customers can open a hosted Customer Portal session.
4. `/api/billing/webhook` verifies the raw request body against `Stripe-Signature` using HMAC-SHA256 and a five-minute timestamp tolerance before applying state.
5. Processed Stripe event IDs are retained for idempotency.
6. Production readiness requires the Stripe provider and its secret key, webhook secret, and two recurring price IDs; mock billing is valid only for local/staging validation.

The implementation follows Stripe's hosted Checkout/Portal API shape and raw-body webhook-signature requirements. References:
- https://docs.stripe.com/api/checkout/sessions
- https://docs.stripe.com/api/customer_portal/sessions/create
- https://docs.stripe.com/webhooks/signature

## Why not a custom card form

A hosted Checkout surface reduces PCI/payment UI scope for this benchmark and keeps payment-method handling out of ExcluSignal. The product only needs the resulting customer/subscription identifiers and signed lifecycle events.

## Consequences

### Positive
- Payment state and product authorization share one explicit domain model.
- Trial expiry is enforceable without Stripe being connected.
- Mock provider allows deterministic offline tests.
- Stripe can be connected later without changing vendor/opportunity domain logic.
- Scheduled work no longer spends provider quota for inactive tenants.

### Negative / deferred
- Real billing is **not validated** until a Stripe test-mode account, products/prices, webhook endpoint and credentials exist.
- Taxes, invoices, coupons, proration and dunning policy remain delegated to Stripe/default configuration and have not been product-designed.
- SQLite remains a single-instance launch storage boundary.
- A future plan/catalog migration needs care because persisted tenants reference plan keys.

## Acceptance gate

RC9 is not a paid-public release until all of these are observed in Stripe test mode on the hosted deployment:

1. Checkout creates a subscription for the intended tenant and plan.
2. Signed webhook activates the entitlement.
3. Vendor limit changes to the paid tier.
4. Customer Portal opens for the same customer.
5. Cancellation/update webhook changes entitlement as intended.
6. Duplicate webhook delivery does not duplicate state changes.
7. Production readiness passes only with live billing configuration present.
