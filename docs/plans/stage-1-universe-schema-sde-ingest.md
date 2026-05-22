# Stage 1 — Universe schema & SDE ingest

## Context

Aperture is the Next.js + Drizzle + Postgres rebuild of legacy Pathfinder. Stage 0 landed the scaffold (Next 16, Drizzle/`pg`/`drizzle-kit` installed, Dockerized Postgres 18 with `pgcrypto` + `pg_partman`, typed `env`/`aperture.config`, green CI). There is **no `src/db` directory yet** and `db:generate` / `db:migrate` are stub scripts that error with "wired up in Stage 1".

Stage 1 stands up the static-data layer that every later phase depends on: the `universe_*` Drizzle schema, the migration toolchain, and a one-shot SDE ingest CLI that backfills from CCP's official Static Data Export. This is SPEC §9 **Phase 0 — Static-data parity**. No `pf_*` tables, no auth, no UI — pure substrate.

**Decisions (confirmed with user):**
- **SDE source:** CCP's **official YAML** Static Data Export (the source of truth per SPEC §6.4), pinned to a specific build.
- **Schema scope:** the roadmap subset + minimal dependencies only — `region, constellation, system, group, category, type, dogma_attribute, type_attribute, stargate_edge, type_override, system_static, wormhole`. Stars/planets/stations/structures/factions/races/alliances/corps/sovereignty/faction-war are deferred to the stages that first need them.
- **Wormhole data is community-sourced (anoik.is), not in the SDE.** Two vendored CSVs cover it: `system-static.csv` (per-system statics, anoik.is /systems) and `wormhole-classes.csv` (the WH-type routing catalog with source/target class, anoik.is /wormholes). Note: `system-static.csv` is referenced by the ingest but is **not yet present** in the repo — until both CSVs are vendored their loaders warn-and-skip, so the build/ingest stays green.
- **Verification:** no legacy `eve_universe` DB is available; the smoke test pins lower-bound counts from the chosen SDE build and runs a 100-system spot-check + route-lookup self-consistency, rather than a literal 0.5% diff against legacy.

**Spec references:**
- [SPEC §6.1 ORM/DB/naming](../spec/SPEC.md) — single schema; `universe_` prefix mandatory; snake_case DB ↔ camelCase TS via Drizzle `name:`; `timestamptz` only; universe spatial IDs are `integer` (only EVE-entity/structure IDs are `bigint`); real FKs across former schema boundaries.
- [SPEC §6.4 Static-data bootstrap](../spec/SPEC.md) — streaming SDE ingest; `universe_stargate_edge` directed edge table (PK `(from,to)`, index on `to`); `universe_type_override` + `universe_type_attribute_effective` view; `wormhole.csv` as one-shot bootstrap into the override table.
- [02-data-model.md §§16–19](../spec/02-data-model.md) — legacy universe model field lists (region/constellation/system/group/category/type/dogma_attribute/type_attribute/stargate/system_static) and the `security` label derivation, wormhole dogma attrs (1381–1385, 3974), `formatWormholeName`.
- [docs/plans/rebuild-roadmap.md § Stage 1](rebuild-roadmap.md) — the stub being expanded.
- [CLAUDE.md § Companion `.md` files](../../CLAUDE.md) — every `.ts` written gets its companion `.md` in the same edit; `src/db/schema.md` is the schema index.

---

## Sub-stage 1.0 — Promote this plan into `docs/plans/`
**Mode:** Accept edits
**Goal:** Per roadmap line 162, the first action of the stage's session is to write its sub-plan into the canonical location next to the other stage plans.
**Touches:** `docs/plans/stage-1-universe-schema-sde-ingest.md`.
**Done when:** This plan's body lives at that path (committed alongside the code).

## Sub-stage 1.1 — Drizzle infrastructure & migration toolchain
**Mode:** Accept edits
**Goal:** A working DB client and `drizzle-kit` pipeline; `pnpm db:generate` and `pnpm db:migrate` do real work.
**Touches:** `drizzle.config.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `package.json` (replace the two stub scripts; add `sde:bootstrap`), companion `.md` files.
**Done when:** `pnpm db:generate` emits SQL into `src/db/migrations/` and `pnpm db:migrate` applies it cleanly against the Docker Postgres.

Details:
- `drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/db/schema/**/*.ts'`, `out: './src/db/migrations'`, `dbCredentials.url: env.DATABASE_URL` (read via `src/lib/env.ts`).
- `src/db/client.ts`: a singleton `pg` `Pool` + `drizzle(pool, { schema })`. Exports `db` and `pool`. `pg` is already in `next.config.ts` `serverExternalPackages`.
- `src/db/migrate.ts`: thin runner using `drizzle-orm/node-postgres/migrator` (`migrate(db, { migrationsFolder })`), invoked by `pnpm db:migrate`; exits non-zero on failure.
- `package.json`: `db:generate` → `drizzle-kit generate`; `db:migrate` → `tsx src/db/migrate.ts`; add `sde:bootstrap` → `tsx scripts/sde-bootstrap.ts`. Add devDep `tsx`.

## Sub-stage 1.2 — `universe_*` Drizzle schema + first migration
**Mode:** Accept edits
**Goal:** All in-scope universe tables modeled in Drizzle with real FKs, then a generated migration that applies.
**Touches:** `src/db/schema/universe/*.ts` (one file per logical group), `src/db/schema/index.ts`, `src/db/schema.md`, `src/types/index.ts` (re-export `InferSelectModel`/`InferInsertModel`), `src/db/migrations/` (generated), companion `.md` for each.
**Done when:** `pnpm db:generate && pnpm db:migrate` applies; `pnpm typecheck` passes with the re-exported row types.

Tables (snake_case columns; `integer` PKs for universe IDs; FKs explicit):

| Table | Key columns / FKs |
|---|---|
| `universe_region` | `id` int PK, `name` text, `description` text |
| `universe_constellation` | `id` int PK, `region_id` → region **CASCADE**, `name`, `x`/`y`/`z` double |
| `universe_system` | `id` int PK, `constellation_id` → constellation **CASCADE**, `name`, `security` text (derived label `H`/`L`/`0.0`/`C1`–`C6`/`P`/`A`), `true_sec` double, `security_status` double, `security_class` text, `effect` text, `x`/`y`/`z` double |
| `universe_category` | `id` int PK, `name`, `published` bool |
| `universe_group` | `id` int PK, `category_id` → category **CASCADE**, `name`, `published` bool |
| `universe_type` | `id` int PK, `group_id` → group **CASCADE**, `name`, `description`, `mass`/`volume`/`capacity`/`radius`/`packaged_volume` double, `portion_size`/`market_group_id`/`graphic_id` int, `published` bool |
| `universe_dogma_attribute` | `id` int PK, `name`, `display_name`, `description`, `published`/`stackable`/`high_is_good` bool, `default_value` double, `icon_id`/`unit_id` int |
| `universe_type_attribute` | `type_id` → type **CASCADE**, `attribute_id` → dogma_attribute **CASCADE**, `value` double, PK `(type_id, attribute_id)` |
| `universe_stargate_edge` | `from_system_id` → system **CASCADE**, `to_system_id` → system **CASCADE**, PK `(from_system_id, to_system_id)`, **index on `to_system_id`** |
| `universe_type_override` | `type_id` → type **CASCADE**, `attr_id` int, `value` double NOT NULL, `reason` text, `updated_at` timestamptz default now(), PK `(type_id, attr_id)` |
| `universe_system_static` | `system_id` → system **CASCADE**, `type_id` → type **CASCADE**, PK `(system_id, type_id)` |
| `universe_wormhole` | `type_id` → type **CASCADE** PK, `name` text, `source_class` text (null = any/K162), `target_class` text (null = unknown/K162) — WH-type routing catalog, class labels only (mass/lifetime stay dogma-sourced) |

Notes:
- No `pgEnum`s here — universe enums don't exist; the `pf_*` enums land in Stage 6.
- Galactic coords stored as `doublePrecision` (SDE ships them as floats; legacy `BIGINT` was lossy).
- `system.name` immutability and Abyssal/Pochven special-casing are ingest-time concerns (1.4), not schema constraints.

## Sub-stage 1.3 — Effective-dogma view
**Mode:** Accept edits
**Goal:** `universe_type_attribute_effective` view returns `COALESCE(override.value, type_attribute.value)` per SPEC §6.4, so WH dogma reads (attr 3974 etc.) transparently honor overrides.
**Touches:** a custom SQL migration under `src/db/migrations/` (drizzle-kit `--custom`), `src/db/schema/universe/views.ts` (Drizzle `pgView(...).existing()` for typing only), companion `.md`.
**Done when:** `pnpm db:migrate` creates the view; a query for a known WH type's attr 3974 returns the override value when present, else the SDE value.

## Sub-stage 1.4 — SDE ingest module + bootstrap CLI
**Mode:** Accept edits
**Goal:** One re-runnable command downloads CCP's official YAML SDE and populates every `universe_*` table; vendored community CSVs seed WH statics and the dogma-3974 overrides.
**Touches:** `src/lib/sde/ingest.ts`, `src/lib/sde/security.ts` (label derivation helper), `scripts/sde-bootstrap.ts`, `scripts/data/wormhole-overrides.csv` (88 rows, vendored + committed), `scripts/data/system-static.csv` (3771 rows, vendored + committed), `scripts/data/wormhole-classes.csv` (~90 rows incl. K162, vendored + committed), `package.json` deps, companion `.md` files, `src/lib/jobs/sdeIngest.md` (referenced in CLAUDE.md index).
**Done when:** `pnpm sde:bootstrap` against an empty migrated DB completes and every table is populated; re-running is idempotent (upserts, no duplicate-key errors).

Details:
- New deps: `yaml` (streaming parse for the large monolithic files), an unzip lib (`unzipper` or `adm-zip`), `csv-parse`. `tsx` (from 1.1) runs the CLI.
- **Pin the SDE build** (URL + version) as a constant in `src/lib/sde/ingest.ts`; document the exact file paths consumed in `src/lib/sde/ingest.md`. CCP reorganizes the SDE periodically — pinning makes ingest reproducible and the gate counts stable.
- Logical ingest steps, ordered to satisfy FKs:
  1. `category` → `group` → `dogma_attribute` (from `fsd/categories|groups|dogmaAttributes`).
  2. `type` + `type_attribute` (from `fsd/types` + `fsd/typeDogma`); stream-parse the big files in chunks.
  3. `region` → `constellation` → `system` (walk the `fsd/universe/**` tree; resolve names; derive `security` label via `src/lib/sde/security.ts` from `security_status`, constellation ID ranges for Abyssal `A`/Pochven `P`, and the `/^j(\d{6}|\d{4}-\d)$/i`/`Thera` WH test).
  4. `stargate_edge`: build `stargateID → systemID` map from the universe tree, then for each stargate emit `(system, destination's system)`; skip edges whose endpoint system is absent.
  5. `system_static` from vendored `system-static.csv` (WH statics are **not** in the official SDE — community data, hence vendored).
  6. `type_override` from vendored `wormhole-overrides.csv` with `reason = 'esi-missing-3974'` (one-shot bootstrap; admin-editable thereafter, survives SDE refreshes).
  7. `wormhole` catalog from vendored `wormhole-classes.csv` (`code;sourceClass;targetClass`); resolve each code → typeId via the WH-code→type map built in step 2; empty class cell → null (K162 = any). Class labels only — mass/lifetime/scan-strength stay dogma-sourced.
- Bulk inserts chunked (~1000 rows) with `onConflictDoUpdate`/`onConflictDoNothing` keyed on the natural PK for idempotency.
- This is a **CLI ingest**, not a `graphile-worker` job (the scheduled SDE-delta job is a later stage); keep it under `src/lib/sde/` and `scripts/`.

## Sub-stage 1.5 — Phase-0 gate smoke test
**Mode:** Accept edits
**Goal:** A test suite that proves static-data parity against the pinned SDE build.
**Touches:** `tests/db/universe-ingest.test.ts`, `tests/db/universe-ingest.md`, possibly a CI job that runs `pnpm sde:bootstrap` once before the suite.
**Done when:** Against a bootstrapped DB the suite is green; documents how to reproduce.

Assertions:
- **Lower-bound counts** for the pinned build (e.g. systems ≥ ~8.2k, regions ≥ ~110, constellations ≥ ~1.1k, types in the tens of thousands) — pinned constants, not a legacy diff.
- **Referential self-consistency:** every `stargate_edge` endpoint resolves to an existing `system`; every `type_attribute.type_id` exists; no orphaned `system_static`/`type_override`.
- **100-system spot-check:** sample 100 system IDs (including known fixtures — Jita 30000142, Thera, a C-space J-system, an Abyssal/Pochven system) and assert name + derived `security` label + non-zero neighbour count where expected.
- **Route lookup:** a recursive-CTE query over `universe_stargate_edge` confirms a known adjacency (Jita 30000142 ↔ Perimeter 30000144) and returns a multi-hop path of plausible length for a known pair. (Production route planning is a later stage; this is a self-consistency probe only.)
- **Wormhole catalog** (when `wormhole-classes.csv` is vendored): `universe_wormhole` is populated; every `source_class`/`target_class` is a valid class label (`C1`–`C6`, `C13`, `HS`, `LS`, `NS`, `Thera`, `Pochven`) or null; `K162` is present with both classes null; a spot code (e.g. `A239`) resolves to a real `type_id` with the expected source/target class.
- Because full ingest is heavy (download + parse, minutes), gate the suite behind a populated DB / dedicated CI job rather than the default fast `pnpm test` lane.

---

## Critical files
- Toolchain: `drizzle.config.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `package.json`
- Schema: `src/db/schema/universe/*.ts`, `src/db/schema/index.ts`, `src/db/schema.md`, `src/types/index.ts`, `src/db/migrations/*`
- Ingest: `src/lib/sde/ingest.ts`, `src/lib/sde/security.ts`, `scripts/sde-bootstrap.ts`, `scripts/data/*.csv`
- Tests: `tests/db/universe-ingest.test.ts`

## Reuse / patterns
- `src/lib/env.ts` already validates `DATABASE_URL` — read it; don't re-parse `process.env`.
- Drizzle Kit owns migration SQL; the view goes through a `--custom` migration, not hand-applied DDL.
- Companion `.md` for every `.ts` (CLAUDE.md standing instruction); `src/db/schema.md` is the schema index.
- Shared row types come from Drizzle inference re-exported via `src/types/index.ts` — no hand-written duplicates.
- Universe spatial IDs are `integer` per SPEC §6.1; reserve `bigint` for EVE-entity IDs in later `pf_*` stages.

## Verification
1. `docker compose up -d db` healthy (Stage 0 already provides `pgcrypto`/`pg_partman`).
2. `pnpm db:generate && pnpm db:migrate` — schema + view applied cleanly.
3. `pnpm sde:bootstrap` — populates all `universe_*` tables; re-run is idempotent.
4. `pnpm typecheck` / `pnpm lint` green.
5. `tests/db/universe-ingest.test.ts` green against the bootstrapped DB (counts, self-consistency, 100-system spot-check, route lookup).

Stage 1's roadmap "Done when" — SPEC §9 Phase-0 gate — is satisfied when steps 3 and 5 pass on the pinned SDE build.