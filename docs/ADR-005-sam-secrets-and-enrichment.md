# ADR-005 — SAM.gov secrets and on-demand enrichment

Date: 2026-09-18

## Decision
Keep SAM.gov discovery metadata and opportunity-description enrichment separate. Discovery is shared and cached. Description retrieval is server-side, on demand, restricted to official `api.sam.gov` / `api-alpha.sam.gov` hosts, and cached by notice ID.

Never commit or ship a SAM.gov API key. Production must inject it through the hosting provider's secret manager. Individual keys should not be pasted into source, reports, client JavaScript, URLs exposed to browsers, or evaluation bundles.

## Why
- The public Opportunities API requires an API key and uses pagination/date filters.
- The API response exposes a description URL rather than necessarily embedding the description text.
- Fetching every description during every sync would multiply API calls and waste quota.
- Server-side enrichment avoids exposing credentials and lets multiple tenants reuse cached public content.
- Requirement extraction is intentionally deterministic and labels outputs as candidates requiring human review.

## Operational consequence
A live deployment requires one human secret-injection step. The offline/demo build still requires zero external credentials.
