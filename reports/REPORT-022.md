# Report 022 — RC10 Paid-Beta Hardening

Date: 2026-09-19
Release candidate: 1.0.0-rc.10
Commercial brand: ExcluSignal

## Why this release exists

RC10 is based on observations from a real hosted signup and Stripe sandbox subscription lifecycle rather than hypothetical QA. The test reached the public custom domain, created and verified an account through Resend, completed Stripe Checkout, activated Starter through signed webhooks, opened the Customer Portal, and scheduled cancellation at period end.

## Findings from the hosted journey

- Verification email was delayed by the periodic outbox delivery interval.
- The optional company-profile form returned generic `Could not save` text for invalid data.
- A new tenant could see internal DEMO opportunities before a real SAM sync because seed fixtures were used as storage fallback.
- Public UI still exposed internal `RC9` labels.
- `/favicon.ico` returned 404.
- Stripe initially showed duplicated webhook traffic because two Stripe destinations pointed to the same endpoint with different signing secrets. Removing the accidental destination eliminated the new HTTP 400 deliveries; the valid destination continued returning 200. This was configuration, not an application-signature defect.

## RC10 changes

- Immediate Resend attempt for verification/reset email while preserving durable retry.
- Concurrency guard prevents scheduler/request-path duplicate delivery in the supported single-process topology.
- Vendor Watch is now the first screen after verification/login/reset.
- Pursuit profile remains optional and displays actionable validation errors.
- Internal demo opportunity fixtures are hidden/purged whenever the live provider is not mock.
- Public release labels changed to `Beta`; favicon added.
- Scheduled Stripe cancellation date is surfaced in billing UI.

## Evidence already observed

- `exclusignal.com` custom domain: working through Cloudflare/Railway.
- Resend domain: verified; real API send returned HTTP 200.
- Stripe sandbox: Starter $39/month and Team $99/month price IDs verified through Stripe API.
- Hosted Checkout: success.
- Signed billing webhook: subscription activation HTTP 200.
- Customer Portal creation: HTTP 200.
- Cancel-at-period-end webhook update: HTTP 200.
- No real customer payment or MRR claimed.
- Confirmed cash spend so far: **$10.46** for one year of `exclusignal.com`. Railway billing/credits have not been audited as a final invoice, so no additional hosting spend is claimed here.
- Final `customer.subscription.deleted`: not yet observed.

## Remaining commercial gates

Stripe live onboarding, business/tax/privacy/legal decisions, external customer willingness-to-pay, production monitoring, durable source deployment, independent disaster recovery and formal trademark review remain.
