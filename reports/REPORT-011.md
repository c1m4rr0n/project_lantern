# Project Lantern — Report 011
## Milestone: 1.0.0-rc.2 account-security loop
Date: 2026-09-18

## Objective
Close the public-account loop without introducing a paid identity provider: require verified email, provide password recovery, make reset links single-use/expiring, revoke old sessions after a password change, and prove the entire sequence as a black-box HTTP flow.

## Autonomous decisions
1. **No Auth0/Clerk/Supabase Auth yet.** The benchmark keeps identity inside the existing zero-package Node/SQLite runtime so account security can be evaluated without a new account, SDK or mandatory monthly cost.
2. **Hash account-security tokens at rest.** Verification/reset links contain high-entropy random tokens; the database stores SHA-256 hashes only.
3. **Revoke stateless sessions with a version counter.** Signed cookies remain simple, but each authenticated request checks the current account `sessionVersion`. Password reset increments that counter, invalidating every older cookie.
4. **Email outbox payloads become sensitive data.** Verification/reset links remain available only while retry is necessary. After successful delivery the archived message replaces the payload with `{ "redacted": true }`.
5. **Do not spend upstream quota for ineligible accounts.** The daily job now identifies verified/configured tenants before fetching the shared opportunity feed; if none qualify, upstream calls are zero.

## Implemented
- `email_verified_at` + `session_version` account fields with migration compatibility.
- `auth_tokens` table with token hash, kind, expiry and consumption time.
- One-time email-verification token issuance/rotation/consumption.
- One-time password-reset token issuance/rotation/consumption.
- Password reset also proves email possession for an unverified account.
- Older sessions invalidated after password reset.
- Generic reset/resend responses where practical to reduce enumeration.
- Rate limiting extended to all public account-security POST endpoints.
- Verification and password-reset HTML/text email templates.
- Generic outbox queue helper and sensitive-payload redaction after send.
- Browser UI for verification, resend, forgot-password and reset flows.
- Production readiness now requires an explicit public base URL for secure account links.
- Reusable `npm run smoke:auth` black-box smoke harness.

## QA result
Automated suite: **38/38 passing**.

Black-box auth smoke result:
- register → `201`
- protected API before verification → `401`
- verify-email token → `200`
- protected API after verification → `200`
- password-reset request → `200`
- password reset → `200`
- old signed cookie after reset → `401`
- new signed cookie → `200`
- old password login → `401`
- new password login → `200`

The first ad-hoc smoke harness printed an incorrect value in its final summary because one shell variable was reused. The individual HTTP log showed the correct pre-verification `401`. Rather than hiding that harness error, a reusable Node smoke script was added and rerun; it reports the correct result set above.

## Email-sensitive-data validation
Console outbox delivery processed both verification and reset messages. The archived sent files contained `payload: { "redacted": true }`; neither usable token remained in the archived payload.

## Cost state
- Mandatory paid API spend: **$0**.
- Mandatory identity-provider spend: **$0**.
- Mandatory LLM calls in the critical path: **0**.
- Human interventions required so far: **1** (obtaining the SAM.gov credential).

## Remaining paid-public-beta gates
- Internet-enabled deployment and live SAM validation.
- Hosting/persistent-volume/secret-manager authorization.
- Verified sending domain + live transactional send.
- Billing/subscription enforcement.
- Centralized production monitoring/incident alerting.
- Privacy/terms/legal review.
- Postgres-class storage before horizontal scaling.
