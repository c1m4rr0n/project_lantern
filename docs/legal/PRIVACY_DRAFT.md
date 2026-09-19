# Privacy information draft

**DRAFT — REQUIRES HUMAN/LEGAL REVIEW BEFORE PUBLIC RELIANCE**

This is a factual inventory of the RC19 implementation, not an approved privacy notice or legal advice. Operator identity, address, applicable law, lawful bases, rights procedures, international transfers, provider agreements and final retention periods remain for human review.

## Information processed

- Account email, creation/verification dates, salted scrypt password hashes, hashed one-time verification/reset tokens, and session version.
- Customer-entered vendor legal names, UEI/CAGE identifiers and notes; company profile, pursuit decisions and public opportunity information.
- SAM.gov public-source exclusion matches, screening timestamps, source dates/files/hashes, status changes and review acknowledgements. Public data can be incomplete or stale and is not a legal eligibility decision.
- Stripe customer/subscription identifiers and entitlement state. Checkout and billing management are hosted by Stripe; this application does not collect card numbers.
- Minimal security audit actions and first-party product milestones. Analytics do not intentionally record vendor evidence, IP addresses, passwords, cookies or auth links. Hosting infrastructure may maintain its own request logs and identifiers; those configurations require review.

## Purposes and technical services

Information supports authentication, exclusion screening, evidence/history, email delivery, billing access controls, reliability, security and aggregate product evaluation. Hosting currently uses Railway; configured email delivery uses Resend, which receives recipient addresses and email contents. Digests can contain vendor/pursuit information. SAM.gov supplies public exclusions/opportunities and USAspending supplies public award context. Optional S3-compatible backups send the verified database and manifest to an operator-selected storage provider; they are disabled by default.

## Sessions and storage

Authentication uses a signed HttpOnly session cookie, SameSite=Lax, secure in production. No third-party analytics SDK is required. Tenant records reside in SQLite on one persistent volume. JSON storage exists for compatibility/local testing. Backups contain account information and password hashes and need independent access protection and encryption at rest.

## Retention and deletion — review required

Current screening history retains up to 730 entries per vendor and opportunity changes up to 50 per opportunity; these are counts, not promised time periods. Archive preserves existing history but does not exempt it from existing retention rules. Audit and detailed analytics events have a configurable 90-day engineering default with pruning on append; analytics milestone timestamps remain until account deletion. Outbox and backup retention must be reviewed separately; no blanket expiry promise is made.

Authenticated users can export tenant data after password confirmation. Deletion requires password confirmation and explicit text, and is blocked until linked billing is confirmed ended. It removes credentials, auth tokens, tenant documents, analytics and matching local outbox contents. Minimal opaque deletion receipts remain to support recovery; operators must remove them only after all backups that could restore the account have expired or been sanitized. Historical backups and third-party records do not disappear immediately. Before restoring a backup, operators must reapply subsequent deletions.

Do not upload CUI, export-controlled material, passwords or unnecessary sensitive personal information in notes. Confirm a support contact, rights-request process, approved retention schedule, subprocessor disclosures and deletion/restore procedures before publication.
