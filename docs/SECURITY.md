# Security baseline — 1.0 release candidate

## Implemented
- Scrypt password hashing with a unique random salt per password.
- Signed `HttpOnly` session cookies with `SameSite=Lax`; production readiness requires secure cookies.
- A server-side `sessionVersion` is checked for every authenticated request. Password reset increments it, revoking older cookies immediately.
- Email verification is required before workspace APIs are accessible.
- Verification and password-reset links use random 256-bit tokens, are single-use, expire automatically and are stored only as SHA-256 hashes.
- Issuing a newer token invalidates an older unconsumed token of the same type.
- Password-reset and resend endpoints return generic success messages when possible to reduce account enumeration.
- Auth endpoints use a fixed-window limiter keyed by path and client address. Forwarded addresses are trusted only when `TRUST_PROXY=true`.
- Request bodies have explicit size caps.
- Tenant IDs are validated and tenant storage is isolated.
- SAM credentials remain server-side; enrichment URLs are restricted to approved SAM API hosts.
- Security headers include `nosniff`, frame denial, no-referrer, a restrictive permissions policy and CSP on static responses.
- Verification/reset outbox payloads are redacted from archived sent messages after delivery.
- Repository secret scan is part of the release gate.
- Billing entitlements are enforced server-side for vendor creation/screening and scheduler work.
- Stripe webhooks are verified from the raw request body using HMAC-SHA256 and a bounded timestamp tolerance; processed event IDs are retained for idempotency.

## Deliberate limits
- Logout removes the browser cookie but does not add a server-side denylist entry. Security-sensitive password reset revokes all prior cookies via `sessionVersion`.
- SQLite launch mode is single-writer/single-instance; horizontal scaling requires the future Postgres adapter.
- Local fixed-window rate limiting resets on process restart and is not distributed. Before multi-instance deployment, move abuse controls to the edge or a shared store.
- No CUI/export-controlled data should be uploaded to the MVP. Requirement candidates are decision support, not legal determinations.

## Remaining before paid public production
- Deploy behind TLS with `COOKIE_SECURE=true` and an explicit HTTPS `PUBLIC_BASE_URL`.
- Verify the production sending domain and provider credential.
- Add centralized application/error monitoring and incident alerts.
- Complete a real Stripe test-mode subscription lifecycle and validate webhook endpoint monitoring.
- Add durable audit-event storage for security-sensitive account and admin actions.
- Add dependency/container/SAST scanning if external runtime dependencies are introduced.
- Formal privacy/terms/legal review.
