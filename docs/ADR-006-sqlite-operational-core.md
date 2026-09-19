# ADR-006 — SQLite operational core before managed Postgres

**Decision:** use Node 22's native SQLite support for the first deployable benchmark release, behind a storage-manager interface.

**Why:** it adds transactional persistence, WAL mode, uniqueness constraints and verified online backups without adding npm dependencies, another account, or paid infrastructure. This maximizes reproducibility and minimizes human intervention for the benchmark.

**Tradeoff:** one writable service instance only. Native `node:sqlite` is experimental in Node 22. The domain/service layer must not depend on SQLite-specific APIs so Postgres can replace it before horizontal scaling.
