# Account lifecycle and commercial beta

One account is one tenant. Public plan Scale retains internal key `team`, STRIPE_PRICE_TEAM and 500 active vendors. Multi-user membership, invitations and roles remain future work. Price IDs are not changed.

## Export and deletion

POST /api/account/export accepts current password and requires a verified session, matching Origin and rate-limit allowance. Returns versioned JSON with safe account details, profile, vendors, retained screenings, opportunities, decisions, changes, audit and explicitly selected billing metadata. No password/session/token hashes, provider credentials or webhook event bodies are exported. Available on inactive plans.

POST /api/account/delete additionally requires confirmation `DELETE`. Paid subscriptions must be ended, not merely scheduled to cancel; a read-only Stripe subscription retrieval confirms terminal status and blocks when unavailable. No automatic cancellation or charge occurs. Credentials/tokens, tenant documents/analytics and matching outbox files are removed. SQLite deleted pages/WAL and historical backups are not promised securely overwritten; protect them with disk/bucket controls.

An exclusive maintenance barrier drains requests and scheduler/outbox work before cleanup. A durable pending deletion job enables startup recovery before accepting traffic. If cleanup fails mid-flight, the instance fails closed with 503 until the operator repairs the cause and restarts it; investigate logs/storage, do not delete the pending job. Completed jobs retain opaque account/tenant IDs and timestamps, not email/evidence, so operators can reapply deletions following backup restoration. Retain these receipts until affected backups expire, then prune under the approved policy. No fixed legal retention policy is implied.

## First-party analytics

`npm run analytics:summary` returns aggregate unique-account milestone counts (signup → verified → first vendor → first screening → subscription activation), never a customer directory. Detailed events retain 90 days by default (ANALYTICS_RETENTION_DAYS), pruned when new events are added; milestone timestamps deduplicate first events across that window. Meaningful return is a verified account-identity load once per day. Events begin with this instrumentation and deleted accounts disappear from totals; results are not MRR or retrospective conversion proof. Run administrative scripts against a protected data root; no public analytics endpoint exists.

## Stripe lifecycle and reconciliation

Checkout creation is serialized per tenant and records pending state before the external call. Duplicate/pending checkout requests are blocked; existing subscriptions must be managed through the portal. A matching checkout.session.expired event clears a pending session. If a request fails before returning a session ID or the expiry webhook is lost, support must reconcile the pending checkout before deletion or another checkout. This deliberately fails safe rather than risking orphan subscriptions. Deletion also checks all subscriptions for the known customer; ambiguous or paginated results require manual review.

Subscription-created/updated/deleted events enforce server-side access. Canceled subscriptions cannot be revived by late events for the same subscription; new subscriptions can activate. Event IDs remain durable in tenant billing state rather than a 100-ID ring. Older subscription timestamps are ignored; timestamp ties are conservative for terminal transitions. Webhook state without a recognized account is ignored, preventing deleted-tenant resurrection.

`npm run doctor:stripe` retrieves current subscription state with test credentials only and reports aggregate differences. To reconcile local state, stop the application writer, set STRIPE_RECONCILE_OFFLINE=true, and run `npm run doctor:stripe -- --apply`. Live credentials and non-sandbox subscription responses are rejected. The command never cancels subscriptions or charges cards. Price/status/tenant mappings should be reviewed when investigating lost webhook delivery. Real provider sandbox testing and webhook alert delivery remain external validation tasks.

## Future indexing switch

Default PUBLIC_LAUNCH_ENABLED=false keeps static noindex metadata, robots disallow-all, and no sitemap. For a separately approved launch, set PUBLIC_BASE_URL to the canonical HTTPS origin, APPROVED_PRIVACY_URL and APPROVED_TERMS_URL to human-approved HTTPS pages, LEGAL_LINKS_APPROVED=true and PUBLIC_LAUNCH_ENABLED=true. Only landing/pricing receive canonical/index metadata and sitemap entries; workspace/auth/API surfaces stay excluded. Draft legal files are never served by the public static root or linked as approved policies.
