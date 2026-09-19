# Project Lantern — Report 013
## Milestone: 1.0.0-rc.4 fail-fast deployment lifecycle
Date: 2026-09-18

## Objective
Use the waiting time before hosting authorization to remove a deployment failure class that unit tests and post-start readiness alone cannot prevent: starting a production process against the wrong filesystem, an unwritable volume, a damaged SQLite file or unsafe production defaults.

## External deployment facts rechecked
Railway documentation was rechecked on 2026-09-18 before changing the repository:

- Railway volumes expose the configured mount path through `RAILWAY_VOLUME_MOUNT_PATH`.
- Railway states that volumes are mounted as `root`; a non-root image may require `RAILWAY_RUN_UID=0` for this initial deployment shape.
- Railway's legacy `railway.toml` / `railway.json` Config as Code is deprecated for new services. The current CLI points users toward Infrastructure as Code via `railway config init` and `.railway/railway.ts`.
- Railway supports platform-level volume backups. Lantern's own backups on the same volume are useful against logical corruption but are not independent disaster recovery if the volume itself is lost.

Official references:
- https://docs.railway.com/volumes
- https://docs.railway.com/variables/reference
- https://docs.railway.com/config-as-code
- https://docs.railway.com/cli
- https://docs.railway.com/integrations/api/manage-volumes

## Autonomous decisions
1. Do **not** add a new legacy `railway.toml` merely to make the repository look deployment-ready. The provider now marks that mechanism as deprecated for new services.
2. Refuse to bind the HTTP port in production unless critical runtime assumptions are true.
3. Treat the persistent-volume mount path as a correctness condition on Railway, not a documentation suggestion.
4. Keep graceful termination bounded so a redeploy cannot hang forever waiting for an open connection.
5. Continue treating same-volume SQLite backups as recovery from application/data mistakes, not as full disaster recovery.

## Implemented
- `src/runtime/preflight.js`.
- Writable-data-root probe using a temporary mode-0600 file.
- SQLite `PRAGMA quick_check` exposed through the storage manager.
- Production startup reuses all existing readiness configuration checks.
- Railway-specific check: when Railway runtime metadata exists, `RAILWAY_VOLUME_MOUNT_PATH` must resolve to exactly `DATA_ROOT`.
- `/api/health` now exposes only non-secret deployment metadata: platform, region, deployment ID presence/value and whether a volume mount variable exists.
- `SIGTERM`/`SIGINT` shutdown now stops the scheduler, closes HTTP, closes SQLite and exits `0`; a 10-second deadline forces failure if shutdown stalls.
- New black-box `npm run smoke:lifecycle`.
- Deployment documentation updated to avoid deprecated Railway config format for new services and to state the backup boundary explicitly.

## Automated QA
Automated suite after RC4 changes: **47/47 passing**.

New tests prove:
1. valid production-shaped configuration can write the data root and passes SQLite integrity;
2. Railway volume mismatch causes production preflight failure;
3. insecure/development defaults cause production preflight failure before traffic is served.

## Black-box process lifecycle smoke
The new smoke test starts actual child processes rather than calling functions directly.

Unsafe case:
`NODE_ENV=production + mock providers + insecure cookie + console email + short secret`

Observed result:
- process exit code: **1**;
- failure occurs before readiness;
- output contains the production-preflight failure.

Valid production-shaped case:
`SQLite + SAM adapter + USAspending adapter + scheduler + secure cookie + HTTPS base URL + Resend-shaped config`

No network request is required during startup because there are no eligible tenants in the temporary database.

Observed result:
- `/api/ready`: **200**;
- `SIGTERM` delivered to process;
- structured `shutdown_complete` event emitted;
- process exit code: **0**.

## Failure / issue log
No product regression was found in RC4 tests. One strategic documentation issue was found before implementation: Railway's legacy Config as Code had become deprecated for new services, so the planned idea of adding `railway.toml` was intentionally discarded instead of committing an already-obsolete hosting format.

## Cost state
Mandatory development/demo spend remains **$0**. RC4 added no external API, package, managed database or paid service.

## Human intervention count
Still **1**: the SAM.gov credential. Railway has been suggested to the user but is still not installed/authorized in ChatGPT, so no hosting account action has been counted as completed yet.

## Next gate
Once Railway is installed/authorized:
1. create the real project/service;
2. attach one persistent volume;
3. inject non-secret configuration and owner-managed secrets;
4. generate HTTPS domain;
5. deploy this validated commit;
6. require `/api/ready=200`;
7. validate the real SAM credential from the hosted runtime;
8. enable platform-level volume backup in addition to Lantern's internal SQLite backups;
9. validate one live verification email and one live digest.
