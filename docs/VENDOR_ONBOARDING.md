# Vendor onboarding and evidence

Vendor Watch is the primary workflow. No NAICS/profile setup is required. Add vendors manually or select a UTF-8 CSV (optional BOM). Limits: 1 MiB, 1,000 data rows. Supported aliases include legal name/name/vendor name/company name, UEI/unique entity ID/unique entity identifier, CAGE/CAGE code, notes/internal note.

Preview identifies valid, invalid and duplicate rows. Select valid rows and explicitly confirm. Commit revalidates against current tenant data; a changed roster requires a fresh preview. If selected rows exceed entitlement capacity, no rows are committed: select fewer or change plan. Exact UEI/CAGE duplicates include archived records. Name-only duplicates require manual resolution; no automatic merge occurs. Import does not initiate screening.

Normal removal is Archive, including legacy DELETE API calls. Archived vendors retain existing screening history and do not consume active slots or receive scheduled/manual screening. Restore checks capacity. No vendor hard-delete UI exists. Existing storage retains at most 730 screenings per vendor; archival itself does not prune them. Reports accurately describe retained history, not unlimited retention.

Download CSV for all active/archived vendors and latest screening, or open a vendor evidence report containing retained screening history and use browser Print to PDF. Missing source fields are explicitly unavailable. CSV formula-like cells are neutralized and HTML is escaped. Reports are tenant-authenticated and no-store; protect downloaded copies.

Optional SUPPORT_EMAIL supplies support links in public and authenticated HTML. No personal email is hardcoded; unset means no support address is displayed.

API additions: POST /api/vendors/import/preview and /commit; GET /api/vendors?archived=true; POST /api/vendors/:id/restore; GET /api/vendors/export.csv and /api/vendors/:id/report. Existing DELETE now archives. Tenant and server-side entitlement rules apply.
