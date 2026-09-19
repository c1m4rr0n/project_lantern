# Codex Bootstrap Task — Restore Source of Truth at RC13

## Goal

Convert the current tarball-only public repository into a normal source repository while preserving the exact functional state of live RC13 and retaining release artifacts/history for traceability.

This is a **source restoration task**, not RC14 feature development and not a production deployment task.

## Inputs provided with this handoff

1. `project-lantern-history-1.0.0-rc.10.bundle`
   - verified complete Git history through RC10;
   - contains source, tests, scripts, docs, ADRs and reports.

2. `project-lantern-rc13-source-reconstruction.tar.gz`
   - source tree reconstructed from the RC10 history plus the exact RC13 runtime overlay;
   - includes restored tests/scripts/docs and current handoff docs;
   - validated with the full release gate.

3. `rc10-to-rc13-source-reconstruction.patch`
   - human-reviewable reference patch from the RC10 source state to the reconstructed RC13 source state.

## Required procedure

### 1. Establish repository state

In the current `c1m4rr0n/project_lantern` clone:

```bash
git status --short --branch
git remote -v
git fetch origin
git rev-parse origin/main
```

Expected public-main handoff commit:

`38b483cb7cab24045b11887c0680c7f9bdebcfc7`

If `origin/main` has moved, inspect the new commits before proceeding; do not reset them away.

### 2. Create a restoration branch

Create a branch such as:

```bash
git switch -c codex/restore-source-rc13 origin/main
```

Do not force-push and do not rewrite `main` history.

### 3. Keep existing release artifacts

Do **not** delete existing `lantern-runtime-rc*.tar.gz` files or checksum manifests. They are rollback/traceability artifacts.

### 4. Restore source tree

Use `project-lantern-rc13-source-reconstruction.tar.gz` as the intended source-tree state.

Add the source/documentation files to the repository root, including at least:

- `package.json`
- `server.js`
- `src/`
- `public/`
- `data/` mock/static fixtures only
- `tests/`
- `scripts/`
- `docs/`
- `reports/`
- `README.md`
- `.gitignore`
- `.dockerignore`
- `.env.example`
- `Dockerfile`
- `AGENTS.md`
- current handoff markdown files

Never add `.git/` from another repository and never add real runtime `/data` state, SQLite databases, outbox files, backups or secrets.

### 5. Use the history bundle as reference, not as a replacement history

The public tarball repository and the old source bundle have different Git lineages. Do **not** replace or force-reset the public repository to the bundle.

If useful, add the bundle only as a temporary local reference remote or clone it separately for archaeology. The source reconstruction package already resolves the practical RC10 -> RC13 overlay.

### 6. Preserve the full source development commands

The production runtime tarball intentionally had a reduced `package.json` because it did not ship tests/scripts. The restored source repository must keep the full development/release scripts.

The handoff source package already does this and reports version `1.0.0-rc.13`.

### 7. Verify runtime equivalence

The behavior-bearing files restored for RC13 (`server.js`, `src/`, `public/`, and static/mock `data/`) should correspond to the RC13 runtime artifact.

The source `package.json` intentionally contains additional QA/release scripts compared with the minimal runtime package. That difference is expected.

### 8. Run the complete quality gate

```bash
npm run release:gate
git diff --check
```

Expected handoff baseline:

- Node tests: 87/87 pass;
- auth smoke: pass;
- Vendor Watch smoke: pass;
- billing smoke: pass;
- Change Watch smoke: pass;
- Requirement Delta smoke: pass;
- scheduler/restart smoke: pass;
- production-readiness smoke: pass;
- lifecycle smoke: pass;
- secret scan: 0 findings.

If the gate differs, investigate before committing. Do not weaken security/tenant/billing/vendor matching assertions to hide a regression.

### 9. Commit and push branch

Commit the restoration as a source-of-truth migration, for example:

`Restore ExcluSignal RC13 tracked source and test history`

Push the feature branch and report:

- branch name;
- commit SHA;
- release-gate summary;
- files added/changed;
- any deviations from this handoff.

If PR creation is available, open a PR to `main`. Do not deploy Railway as part of this task.

## After this task is merged

Create a separate task to switch Railway from the tarball bootstrap to direct tracked-source deployment. Keep the current RC13 tarball deployment unchanged until that source-based deployment has passed hosted validation and rollback is prepared.
