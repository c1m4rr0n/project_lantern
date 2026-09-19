# Production pipeline hardening — 2026-09-19

## Applied GitHub protection

Classic branch protection on `main`, read back through GitHub API:

- Pull request required; zero additional reviewer approvals required (single-owner workflow). Stale approvals dismissed; code-owner and last-push approvals not required.
- Required checks: `release-gate (ubuntu-latest)` and `release-gate (windows-latest)`, pinned to GitHub Actions app ID 15368 after inspecting successful check runs on the production commit.
- Strict status checks: branch must be up to date with main. Rules enforced for admins; no PR bypass allowance configured.
- Force pushes and branch deletion disabled. Conversations must be resolved.
- Linear history not required; repository `allow_merge_commit=true` preserved. No repository visibility change, branch lock or push-actor restriction added. Signed commits not required.

Do not bypass CI or weaken these settings to merge. A maintainer with repository administration privileges can still edit policy; this is not protection against a compromised administrator.

## Production identity

Annotated tag `v1.0.0-rc.19-production` points to `2c09f7df4601048dd602e77e486e85dd27943d5d`. No equivalent remote tag existed before creation. The tag records operator-confirmed production, not a new deployment. Never move it to a later documentation commit.

## Railway inspection and pending watch patterns

Read-only inspection of `project-lantern` / `production` / `lantern-web` reports GitHub `c1m4rr0n/project_lantern`, branch `main`, the production SHA above, `/api/ready`, port 8787, one replica and external `/data`. No `watchPatterns` field was returned and no staged changes were reported. The response also retains `source.image=node:22-bookworm-slim` and `build.builder=RAILPACK`; these mixed fields do not establish effective build behavior by themselves.

Status: PREPARED ONLY, NOT APPLIED. Do not infer that docs-only pushes are already excluded. No Railway settings, variables or deployment actions were changed. Keep this documentation PR unmerged until safe filter activation is confirmed or an operator explicitly accepts a docs-only deployment.

For the repository-root Docker build, set Watch Paths to exactly these entries, one per line:

```text
/server.js
/src/**
/public/**
/scripts/**
/data/**
/package.json
/package-lock.json
/npm-shrinkwrap.json
/release.json
/Dockerfile
/.dockerignore
/Dockerfile.dockerignore
/railway.json
/railway.toml
/railpack.json
/nixpacks.toml
/Procfile
/.npmrc
/.node-version
/.nvmrc
```

This covers every current Docker COPY input, scripts used by package commands, seed data, runtime identity, build-context exclusions and conventional future build/configuration inputs. The lockfiles/config files not currently present are defensive entries. Do not narrow `public/**`, `src/**`, `scripts/**` or `data/**` by extension: non-JavaScript assets/data can affect runtime. No secrets or production data are added to Git.

Root Markdown documentation, `docs/**`, reports and tests alone do not match. CI still runs for all main PRs regardless of these Railway filters. When adding any new Docker COPY source, startup dependency, build configuration or deployment workflow that consumes other files, update this list in the same change before relying on it. Do not exclude a runtime file merely because its extension is Markdown.

Railway [Watch Paths documentation](https://docs.railway.com/builds/build-configuration#configure-watch-paths) specifies gitignore-style patterns evaluated from the repository root, even when a service root directory is configured.

Safe activation checklist:

1. Confirm the effective production build uses the root Dockerfile and no alternate build/start command consumes additional paths. Inspect settings without exposing variable values.
2. Change only Watch Paths on the named service in the production environment, using the exact array above. Do not accept/deploy unrelated staged changes or edit source, builder, variables, replicas, volume or domain.
3. If saving requires deploying/restarting, stop for operator approval. Do not redeploy merely to apply filters during this hardening task.
4. Read back patterns and verify how they apply to the next GitHub push before merging documentation. Confirm a later authorized docs-only change produces no deployment; confirm the next authorized runtime change does produce one. Do not manufacture a runtime change on production to test this.

Automatic deployment policy remains distinct from GitHub branch protection. Protecting main gates merges; it is not evidence that Railway's separate Wait for CI setting is enabled.
