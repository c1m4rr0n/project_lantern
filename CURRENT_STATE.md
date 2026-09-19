# ExcluSignal — current source state

Source: RC17 commercial hardening. `release.json` and `package.json` are authoritative for source version. Production remains RC16; this branch does not deploy.

Tracked source was restored at `03ed304`. RC14/15 improved responsive/accessibility UX and vendor submission. RC16 restores SAM snapshot metadata on process startup.

RC17 prepares direct Docker/source deployment, Linux/Windows CI, non-secret release identity, durable account/billing audit events, safe operational error metadata and optional S3-compatible verified backup upload. No external monitor or bucket is provisioned.

Vendor Exclusion Watch remains primary. Matching/scoring/requirements are deterministic. SQLite remains one writable instance on /data; JSON storage remains supported for local testing.

See docs/COMMERCIAL_OPERATIONS.md for migration/rollback and optional configuration. Remaining external gates include actual source deployment, independent backup restore drill, external alerts, reviewed legal/business decisions and Stripe Live approval. Historical reports and QA_HANDOFF describe their dated releases, not current production.
