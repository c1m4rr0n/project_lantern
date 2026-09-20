# Current production deployment — operator-reported RC20, RC21 work 2026-09-20

- Production: 1.0.0-rc.20, https://exclusignal.com (operator report)
- Repository: c1m4rr0n/project_lantern
- Production/main commit: afdff08fa87012fb2d35167bc9a06d7b6355021e
- Historical RC19 production tag: v1.0.0-rc.19-production at 2c09f7df4601048dd602e77e486e85dd27943d5d; not moved
- Mechanism: direct GitHub main source deployment to Railway, Node 22; the RC16 tarball bootstrap is historical, not the current deployment mechanism.
- One writable Railway instance; persistent /data; SQLite and in-process scheduler. Port 8787; healthcheck /api/ready.

The operator reports healthy RC20 production. RC21 verified origin/main at the exact SHA above but did not inspect or modify Railway. Earlier read-only Railway inspection concerned RC19, not this runtime. Do not alter legacy builder/bootstrap variables as part of documentation cleanup. Operator-confirmed watch patterns and branch protection are recorded in docs/PRODUCTION_PIPELINE.md.

Documentation-only main commit `035f19448a59c52e6406b17508f03e7976c23ea6` did not trigger a deployment, as confirmed by the operator. Watch Paths were applied externally without a deployment. RC21 is being prepared on a separate branch; this task has not modified Railway, variables, production data or Stripe Live. Production smoke testing remains paused; local mock QA is not production SAM validation. No new variable is required for RC21; optional tuning is documented in docs/OPPORTUNITY_DISCOVERY.md. Promotion requires an approved PR merge and operator runtime validation; no automatic merge is authorized.

## Rollback reference

Historical RC16 artifact commit: c4fbcca604654c2d0d5a55b0dc8a417ff33329e8; lantern-runtime-rc16.tar.gz; SHA-256 d1d5373f2bedf938d7bd1e8b939002eef637fc69ae76f6ffe2b0549eafcb0fef. Retained for provenance, not a safe automatic rollback of migrated data.

RC15 artifact commit: daaf5f188430ae1be18f63bb60b52d09a63fa948; lantern-runtime-rc15.tar.gz; checksum 0f9129155dbeddbb39b4fca235f4c9c3253e30950083530b0a9c337fb790bbf4. All earlier artifacts remain tracked. Preserve the current effective bootstrap configuration before an approved migration.

Do not infer runtime version from Railway SUCCESS. Verify logs, checksum or source identity, readiness, volume and application behavior. Do not start two SQLite writers. Old RC16 does not understand RC18 archive state: rollback after migration requires a compatible binary or deliberate restore of a verified pre-migration backup, with data-loss assessment.

Exact source migration, monitoring and offsite-backup steps: docs/COMMERCIAL_OPERATIONS.md. Secrets remain in the deployment secret manager and never in this document.
