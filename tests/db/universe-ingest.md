## universe-ingest.test.ts

**Purpose:** Phase-0 gate (SPEC §9) — proves static-data parity against the pinned SDE build after `pnpm sde:bootstrap`.
**File:** `tests/db/universe-ingest.test.ts`

### Running
Gated behind `RUN_DB_TESTS=1` (default `pnpm test` stays offline) and runs in the `node` vitest environment. Requires a migrated, bootstrapped Postgres:

```
docker compose up -d db
pnpm db:migrate
pnpm sde:bootstrap
RUN_DB_TESTS=1 pnpm test
```

### Assertions
- **Lower-bound counts** for the pinned build (regions ≥110, constellations ≥1100, systems ≥8200, types ≥40000, type_attributes ≥500k, stargate edges ≥13000, overrides ≥60).
- **Referential self-consistency:** no orphaned stargate-edge endpoints; no orphaned type_attribute type ids.
- **Fixture spot-check:** Jita (30000142 → `H`), Perimeter, Thera (`C…`), J105443 (`C1`), a Pochven system (`P`), an Abyssal system (`A`).
- **100-system sample:** names present; first 100 (k-space) ids each have ≥1 neighbour.
- **Route lookup:** Jita↔Perimeter adjacency present both directions; 5-hop BFS over `universe_stargate_edge` reaches >50 systems.
- **Effective view:** WH A239 (type 30678) attr 3974 resolves to the CSV override value (5).
