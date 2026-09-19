# Committee Report 006 — Multi-tenant authentication and isolation
Date: 2026-09-18

## Objective
Remove the largest architectural limitation of milestone 0.5: all users shared one company profile and one state file.

## Implemented
- Self-service account registration and login UI.
- Password hashing with Node `scrypt`, random salt per password and timing-safe verification.
- Stateless signed session token stored in an HTTP-only, SameSite=Lax cookie.
- Logout and current-user endpoints.
- API authentication boundary returning 401 to anonymous protected requests.
- Tenant-scoped profile and opportunity persistence.
- Path-safe tenant IDs and atomic writes.
- Runtime secrets/account/tenant files excluded from Git.
- Local persisted development session secret when no environment secret exists; production still requires an explicit secret.

## Validation
A real HTTP run created two accounts (Alpha and Beta), saved different profiles and independently read each profile back. Anonymous profile access returned HTTP 401. Alpha's opportunity feed still scored the prepared fixtures correctly.

## Automated coverage added
- Salted password verification and plaintext non-retention.
- Session tamper rejection and expiration.
- Tenant data isolation.
- Tenant ID path-traversal rejection.

## Result
12/12 automated tests passed at this checkpoint.

## Explicit limitations
No email verification, password reset, brute-force rate limiting, managed backups or production database yet. These remain production gates rather than hidden assumptions.
