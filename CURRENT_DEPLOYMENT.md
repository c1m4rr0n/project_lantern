# Current production deployment — last verified 2026-09-19

- Production: 1.0.0-rc.16, https://exclusignal.com
- Repository: c1m4rr0n/project_lantern
- Production artifact commit: c4fbcca604654c2d0d5a55b0dc8a417ff33329e8
- Runtime: lantern-runtime-rc16.tar.gz
- SHA-256: d1d5373f2bedf938d7bd1e8b939002eef637fc69ae76f6ffe2b0549eafcb0fef
- Mechanism: checksum-verified tarball bootstrap on Node 22, not direct source deployment.
- One writable Railway instance; persistent /data; SQLite and in-process scheduler. Port 8787; healthcheck /api/ready.

RC17–RC19 branch work is preparation only and must not be described as deployed. No Railway, DNS or Stripe Live changes are authorized in that work.

## Rollback reference

RC15 artifact commit: daaf5f188430ae1be18f63bb60b52d09a63fa948; lantern-runtime-rc15.tar.gz; checksum 0f9129155dbeddbb39b4fca235f4c9c3253e30950083530b0a9c337fb790bbf4. All earlier artifacts remain tracked. Preserve the current effective bootstrap configuration before an approved migration.

Do not infer runtime version from Railway SUCCESS. Verify logs, checksum or source identity, readiness, volume and application behavior. Do not start two SQLite writers. Old RC16 does not understand RC18 archive state: rollback after migration requires a compatible binary or deliberate restore of a verified pre-migration backup, with data-loss assessment.

Exact source migration, monitoring and offsite-backup steps: docs/COMMERCIAL_OPERATIONS.md. Secrets remain in the deployment secret manager and never in this document.
