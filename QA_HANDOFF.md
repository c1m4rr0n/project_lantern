# RC13 Source Reconstruction — QA Evidence

## Why reconstruction was necessary

The public deployment repository currently contains release tarballs, while the original full source Git history exists separately through RC10. To hand development to Codex without losing tests/docs/history, the source tree was reconstructed as follows:

1. verify `project-lantern-history-1.0.0-rc.10.bundle` as a complete Git bundle;
2. clone the RC10 source history;
3. overlay the exact RC13 runtime `data/`, `public/`, `src/`, `server.js` behavior-bearing files;
4. preserve the full RC10 development scripts/tests/docs instead of the intentionally stripped runtime-only `package.json`;
5. set source package version to `1.0.0-rc.13` and include syntax validation for `public/ui.js`;
6. update two stale public-UI tests to reflect intentional RC13 behavior:
   - asset query strings like `?v=rc13` are cache-version markers, not visible internal release labels;
   - Company onboarding now says `COMPANY PROFILE`, explicitly references Pursuit Watch, and states Vendor Watch can be used without NAICS.

No production secret or runtime database was used in the reconstruction.

## Full gate result

Command:

```bash
npm run release:gate
```

Result: **PASS**.

### Node test suite

- tests: **87**
- pass: **87**
- fail: **0**

### Black-box/system smokes

- auth lifecycle: PASS
- Vendor Watch: PASS
  - high-confidence UEI+CAGE test produced `excluded` internal state / active-exclusion behavior;
  - digest surfaced state;
  - acknowledgement worked.
- billing: PASS
  - trial active;
  - trial vendor limit 25;
  - trial screening permitted;
  - unconfigured hosted checkout correctly returned controlled 503.
- Change Watch: PASS
  - one unread material change;
  - acknowledgement reduced unread count to zero.
- Requirement Delta: PASS
  - added: 1;
  - modified: 1;
  - blockers: 1;
  - fit impact: 86 -> 0;
  - digest surfaced delta.
- scheduler/restart: PASS
  - daily work persisted;
  - email sent;
  - backup integrity `ok`;
  - restart idempotent.
- production readiness: PASS
  - intended production-shaped configuration ready;
  - unsafe configuration rejected.
- graceful process lifecycle: PASS.

### Secret scan

- repository files scanned: **161**
- findings: **0**

## Hosted RC13 evidence after promotion

The production Railway deployment separately verified the exact runtime artifact SHA-256:

`ccc76e2ea030db71ef787bd1691e2defd73ec95b705dfbdda4e26b9e26ef19d1`

Post-deployment Android screenshots confirmed that RC13 resolved the stale/mixed CSS rendering problem and that authenticated mobile navigation/account presentation is coherent.

## Interpretation

This reconstruction provides a tested tracked-source target for Codex. It does **not** itself change Railway or prove a future Git-source deployment until that separate deployment migration is performed and verified live.
