# ADR-003 — Local authentication and tenant boundaries before managed infrastructure
Date: 2026-09-18
Status: accepted for pre-production benchmark

## Decision
Implement account registration/login with Node built-ins, scrypt password hashes, signed HTTP-only cookies and a storage interface that namespaces state by tenant. Do not introduce a paid identity/database vendor yet.

## Why
The benchmark needs to prove the product can move beyond a single-company demo without creating external-account dependencies before they add customer value. Multi-tenant behavior can be tested locally and later migrated behind the storage boundary.

## Security properties in this milestone
- Passwords are salted scrypt hashes; plaintext passwords are never persisted.
- Session cookies are signed, HTTP-only and SameSite=Lax; Secure is enabled behind HTTPS or explicitly via configuration.
- Protected API routes require a valid unexpired signed session.
- Tenant identifiers are UUID-compatible/safe strings and cannot contain filesystem traversal syntax.
- Runtime account, tenant and cache files are excluded from Git.

## Non-goals / launch gates
This is not the final production identity layer. Before public paid launch, move durable data to a managed database with backups, use a production secret manager, add email verification/password reset, rate limiting, audit logging and stronger CSP without inline scripts.
