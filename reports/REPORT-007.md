# Committee Report 007 — Shared ingestion cache and degraded mode
Date: 2026-09-18

## Objective
Prevent upstream API usage and outage exposure from scaling linearly with customer count.

## Implemented
- Shared disk-backed opportunity cache in front of the selected upstream provider.
- Configurable freshness TTL (default 15 minutes).
- Configurable maximum stale fallback window (default 24 hours).
- Atomic cache replacement.
- Single-flight refresh so concurrent requests do not launch duplicate upstream refreshes.
- Health endpoint exposes non-secret cache status metadata.

## Why it matters commercially
SAM.gov data is public/common across tenants. Raw ingestion should happen once; company-specific scoring happens after ingestion. This design lowers variable API pressure per customer and gives Lantern a bounded degraded mode during a temporary upstream outage.

## Automated coverage added
- Repeated calls inside the TTL make one upstream request.
- A failed refresh returns bounded stale data rather than immediately taking the product down.

## Result
14/14 automated tests pass. Required paid API spend remains $0.
