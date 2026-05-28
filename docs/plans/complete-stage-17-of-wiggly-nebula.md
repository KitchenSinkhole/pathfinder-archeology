# Complete Stage 17 — UI Modules & Dialogs Catch-up

## Context

Stage 17 (`docs/plans/rebuild-roadmap.md:125`) is the **parity-sweep** stage: bring the remaining
spec-06–08 dialogs and modules to feature-matrix parity, swap the legacy JS libraries
(DataTables→TanStack Table, Summernote→Tiptap, PNotify→sonner), and land the structure-intel
data dependencies.

This is by far the largest stage in the roadmap (13 dialogs + 13 modules + a DB table). It cannot
land in one session, so per CLAUDE.md's planning protocol it is decomposed into session-sized
sub-stages written to `docs/plans/stage-17-ui-catchup.md`.

**Parity bar (confirmed with user): functional-equivalent.** Every feature-matrix capability must
be *reachable* in the new consolidated architecture; we do **not** rebuild a separate component
just because legacy had one. Much already exists and must be **reused, not duplicated**:
`InspectorModule` (legacy `system_info` + `connection_info` editing), `SignatureModule` +
`SignaturePasteDialog` (Stage 10), `RouteModule`/`IntelModule`/`KillStatsModule` (read-only cards).
`empty.js` is dropped (SPEC §8.2); `demo.js` is dev-only — skip; `header_login.js` starfield dropped.

### Roadmap deviation — structure intel is **manual entry, not ESI** (confirmed with user)

The roadmap assumed `structure-resolve` would refresh `ap_structure` rows via ESI
`getUniverseStructure` (`src/lib/jobs/tasks/structureResolve.ts:21` currently stubs `{ deferred: 'stage-17' }`).
**That premise is wrong.** ESI's `get_universe_structures_structure_id` only returns data for
structures the calling character is authorized to dock at — i.e. structures owned by *their own*
corp. The entire point of structure intel is gathering data on **other** corporations' structures,
which ESI will never return without owner-corp authorization. So:

- There is **no ESI structure resolution** and **no recurring resolve work**. The `structure-resolve`
  job, its cron, registry entry, and stub test are **retired** (not filled in).
- `ap_structure` is a **manual-entry intel table**: users type the system, structure name, and
  structure type (Astrahus / Fortizar / Raitaru / Athanor / etc.). No ESI decoder is needed.
- This deviation is recorded in `docs/plans/rebuild-roadmap.md` (Stage 17 line) and, if it touches
  spec assertions, in `docs/spec/` (CLAUDE.md: keep the spec in sync when a stage discovers
  something the spec didn't anticipate). SPEC §11 footgun #5 ("structure search needs character
  tokens") already hints at this constraint.

**This session delivers two things:**
1. Write `docs/plans/stage-17-ui-catchup.md` — the full sub-stage decomposition (skeleton below).
2. Execute **sub-stage 17.1 — Structure intel data model + retire the ESI job** end-to-end.

---

## This session: Sub-stage 17.1 — Structure intel data model (manual) + retire ESI job

**Goal:** `ap_structure` exists as a manual-intel table; the purposeless `structure-resolve` ESI job
is removed; the roadmap deviation is documented. Manual-entry API + UI are deferred to 17.2.

**Assumption to confirm:** structure intel is **system-scoped and deployment-global** (one structure
list per solar system, shared like the legacy `system_intel` module), keyed by `system_id` — *not*
per-map. If structures should instead be map-scoped, the table gains a `map_id` FK; flag at review.

### 1. Schema — `src/db/schema/ap/structure.ts` (+ `.md`)

Follow the `system_stats.ts` / `map_signature.ts` idiom (snake_case via `name:`, `timestamptz`, real FKs).

`apStructure = pgTable('ap_structure', …)`:
- `id` — `bigserial('id', { mode: 'bigint' })` PK, **app-generated** (no natural EVE id — it's manual intel).
- `systemId` — `integer('system_id')` FK → `universeSystem.id`, `onDelete: 'restrict'` (matches the `ap_map_system.system_id` convention).
- `name` — `text('name')`, the user-typed structure name. Not null.
- `structureTypeId` — `integer('structure_type_id')` FK → `universeType.id`, `onDelete: 'restrict'`. The user picks from the known Upwell structure types (Astrahus, Fortizar, Keepstar, Raitaru, Azbel, Sotiyo, Athanor, Tatara, Ansiblex, …). **A real FK is possible here** (unlike ESI-resolved structures) because the *type* is static SDE data that always exists.
- `ownerName` — `text('owner_name')`, nullable. Free-text owner corp/alliance intel (we can't authoritatively resolve owners, so it's a note).
- `notes` — `text('notes')`, nullable. Free-text intel.
- `createdByCharacterId` — `bigint('created_by_character_id', { mode: 'bigint' })` FK → `apCharacter.id`, `onDelete: 'set null'` (audit; never cascade-wipe intel when a character is erased — SPEC audit rule).
- `createdAt` / `updatedAt` — `timestamptz` default `now()`.

Index `system_id` for the per-system module read. Register the export in the schema barrel
`src/db/schema.ts` and update `src/db/schema.md`.

### 2. Migration — `src/db/migrations/0016_structure.sql` (+ `.rollback.sql`)

Next free number is `0016` (last is `0015_signature_group_key`). Hand-write `CREATE TABLE ap_structure`
with the FKs + the `system_id` index; rollback `DROP TABLE ap_structure`. Plain table — not partitioned.
Mirror the format of `0011_sov_fw.sql` / its rollback.

### 3. Retire the ESI `structure-resolve` job

- Delete `src/lib/jobs/tasks/structureResolve.ts` and `structureResolve.md`.
- Remove its import (`registry.ts:11`) and the `structureResolve` entry + its Stage-11.6 comment
  (`registry.ts:54-55`). The derived `tasks` / `cronItems` update automatically.
- Delete `tests/integration/jobs/structure-resolve.test.ts`.
- **Do not** add an ESI decoder — `getUniverseStructure` (`opkeys.ts:84`) stays mapped (it's a valid
  ESI op and the opkeys test asserts it exists in swagger), it's just unused by us.

### 4. Document the deviation

- Edit the Stage 17 entry in `docs/plans/rebuild-roadmap.md` (lines 125–128 + the Stage 11 deferral
  note at line 94): replace the "fills in the structure-resolve handler / resolves via ESI
  getUniverseStructure" language with "structures are manual-entry intel; the structure-resolve ESI
  job was retired — ESI cannot return other corps' structures."
- If `docs/spec/08-frontend-ui-modules.md` (system_intel) or `10-feature-matrix.md` row 9 (ESI
  structure resolution) assert ESI-backed structures, add a short note pointing at this decision.

### 5. Companion `.md` discipline

Every new/edited `.ts` gets its `.md` in the same change (CLAUDE.md standing instruction):
new `structure.md`; updated `registry.md`, `schema.md`. Remove `structureResolve.md` with its `.ts`.

### 17.1 Done when
`pnpm typecheck` + `pnpm lint` pass; the job registry no longer references `structure-resolve`
(`pnpm test` job-registry suite green); migration `0016` applies and rolls back cleanly against the
containerized Postgres.

---

## Full Stage 17 sub-stage roadmap (to be written to `docs/plans/stage-17-ui-catchup.md`)

Each sub-stage is one session and ends green. Reuse existing components; do not duplicate.

| Sub-stage | Mode | Scope |
|---|---|---|
| **17.1 Structure data model + retire ESI job** | Accept edits | `ap_structure` manual-intel table + migration; remove `structure-resolve` job/test; document deviation. *(this session)* |
| **17.2 Structure intel UI + CRUD API** | Plan | JSON API for manual structure CRUD (system + name + type + owner/notes); new `StructureModule` (or extend `IntelModule`) listing a system's `ap_structure` rows with add/edit/delete; structure-type picker from `universe_type` Upwell types. |
| **17.3 Static reference dialogs** | Accept edits | System Effects (port `docs/spec/system_effect.js` → typed `src/lib/eve/systemEffects.ts` + dialog), Jump Info (wormhole mass/statics/compat from `universe_wormhole` + `signature_type.js`), Shortcuts, Credits. No backend. |
| **17.4 Map Info + Manual dialogs** | Plan | Map Info 4-tab snapshot (Summary / Systems / Connections / Users) over existing map data; Manual scrollspy dialog. |
| **17.5 Account Settings + Delete Account** | Plan | Server Actions over `ap_user`/`ap_character`; auto-pick-on-login pref; account deletion (cascade). |
| **17.6 Map Settings + import/export** | Plan | Consolidated new/edit/settings dialog; reuse admin webhook components; map JSON import/export (`map_import`/`map_export` rights). |
| **17.7 Statistics dialog** | Plan | TanStack Table over `ap_activity_rollup` (Stage 11); period nav; sparklines; rights-gated Private/Corp/Alliance tabs. |
| **17.8 Killboard + System Graph modules** | Plan | `system_killboard` recent-kills feed (reuse Stage 13 `zkb` client); `system_graph` charts over `ap_system_stats` (K-space only). |
| **17.9 Thera + Tags + Dotlan modules** | Plan | Thera eve-scout sync (reuse Stage 13 `evescout`); Tags next-bookmark grid; Dotlan K-space embed/link. |
| **17.10 Remaining dialogs + library swaps + gate** | Plan | Connection mass-log detail; API Status; Changelog (Stage 13 GitHub); Notification full-screen dialog; admin HTML tables → TanStack Table; intel notes textarea → Tiptap; drop `empty.js`; Phase-4 gate test suite (SPEC §9). |

**Cross-cutting (fold into the sub-stage that first needs them):** TanStack Table and Tiptap are
installed but unused — introduce them in 17.7/17.10 and 17.10. sonner is already wired.

---

## Verification (this session)

```powershell
docker compose up -d
pnpm db:migrate          # applies 0016_structure
pnpm typecheck
pnpm lint
pnpm test                # job registry suite green; no structure-resolve references remain
```

- Migration `0016` applies and rolls back cleanly.
- `rg structure-resolve src tests` returns nothing (job fully retired).
- Job-registry / cron-items tests pass without the `structure-resolve` entry.
- `docs/plans/stage-17-ui-catchup.md` exists with the sub-stage table above.
- Roadmap (and any affected spec doc) records the manual-intel / no-ESI deviation.
