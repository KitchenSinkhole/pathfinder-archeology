# Stage 9 — Map Mutation Pathways (CRUD)

**Goal:** All map / system / connection / signature CRUD works end-to-end through the one canonical commit point (one `INSERT INTO ap_map_event` per mutation), replicating to other tabs via realtime. WebSocket stays broadcast-only.
**Spec/roadmap:** `docs/plans/rebuild-roadmap.md` Stage 9; CLAUDE.md "Mutation pathways" + "Realtime"; SPEC §6.4 (wormhole-data wiring).

## Context

Stages 0–8 are built: universe + per-map schema, auth, ESI, app shell, the read-only xyflow map view (Stage 7), and the realtime transport (Stage 8 — WS server + `pg_notify` bus + SharedWorker + `useRealtime`). The data layer and the broadcast pipe both exist; what's missing is the *write* side and the client-side application of live updates. The Stage 8 canvas subscribes to its map channel but explicitly does not apply incoming events (`MapCanvas.tsx:36-38`), and `mapUpdateLoadSchema.data` is still a forward-declared `unknown` (`protocol.ts:96-102`).

This stage closes that gap: a server-side mutation core that always lands exactly one `ap_map_event` (whose `payload` jsonb *is* the realtime `data` body — the `tg_map_event_notify` trigger forwards it verbatim and `bus.ts:142-172` re-wraps it as a `mapUpdate` envelope), the two client-initiated pathways (Server Actions for low-traffic, JSON API for high-frequency), and an editable canvas that applies events optimistically and reconciles against the realtime echo.

**Decisions (confirmed with user):**
- **Authz (interim):** mirror Stage 7 — any logged-in character may mutate any non-soft-deleted map. Leave a clear interim note pointing to Stage 15. Do not build a rights model here.
- **Client update model:** optimistic + reconcile. The initiating client applies locally immediately and dedupes the realtime echo by `eventId`; on server error it rolls back and toasts (sonner).
- **Sessioning:** each sub-stage below is run in its own Claude Code session (fresh context). Open this file, read the sub-stage, enter its labelled mode (`Shift+Tab`), then execute.

## Key facts to reuse (don't re-derive)

- **Enums** (`src/db/schema/ap/enums.ts`): `system_status` = unknown|friendly|occupied|hostile|empty|unscanned; `connection_scope` = wh|stargate|jumpbridge|abyssal; `wh_mass` = fresh|reduced|critical; `wh_jump_mass` = s|m|l|xl; `map_scope`, `map_type`. Use `.enumValues` for client types.
- **Event kinds** already seeded (`migration 0004`, `ap_event_kind`): `system.added`, `system.removed`, `system.updated`, `connection.create`, `connection.update`, `connection.delete`, `signature.create`, `signature.update`, `signature.delete`, `map.create`, `map.update`, `map.delete`. Use these exact strings — do not invent new ones (add a seed row + migration if a genuinely new kind is needed).
- **Trigger:** `fn_map_event_notify` does `pg_notify('map:'||map_id, payload)`. The mutation never calls notify itself — inserting the event row is sufficient.
- **Bus contract** (`bus.ts:155-163`): pulls `kind` from `payload.kind`; forwards parsed payload as `load.data`. **Convention:** every event payload is `{ kind, ...patch }` where `patch` carries exactly what a client needs to update its canvas without refetching, plus the new `eventId` for dedupe.
- **Session:** `requireSession()` → `{ characterId: string; userId: number }` (`src/lib/session.ts`); `getActiveCharacter()` for the row. Use `BigInt(session.characterId)` for the `ap_map_event.character_id` audit FK.
- **DB client:** `import { db } from '@/db/client'`; `db.transaction(...)`. Existing read patterns in `src/lib/map/loadMap.ts`.
- **Existing Server Action shape** (`src/app/(app)/actions/character.ts`): `'use server'`, `requireSession()`, typed `{ ok: true } | { ok: false; error }` result, `revalidatePath`.
- **Companion `.md` discipline:** every new/edited `.ts`/`.tsx` gets its companion `.md` in the same change (CLAUDE.md standing instruction). Shared types go in `src/types/index.ts`.

---

## Sub-stage 9.1 — Event payload contract + mutation core
**Mode:** Accept edits
**Goal:** Tighten the realtime data body and build the single commit primitive every mutation flows through.
**Touches:**
- `src/lib/realtime/protocol.ts` — replace `mapUpdateLoadSchema.data: unknown` with `mapEventPayloadSchema`: a Zod discriminated union on `kind` covering all 12 seeded kinds. Each variant carries `eventId` + the patch fields (e.g. `system.added` → the full node body matching `MapSystemNode`; `system.updated` → `{ id, ...changed }`; `connection.*`, `signature.*`, `map.*` analogously). Export the inferred types.
- `src/lib/map/mutations/core.ts` — `commitMapEvent({ mapId, characterId, kind, mutate })`: opens a `db.transaction`, runs `mutate(tx)` (the row write), inserts exactly one `ap_map_event` with `{ mapId, characterId, occurredAt: new Date(), kind, payload }` (payload built from the mutate result, validated against `mapEventPayloadSchema`), `.returning({ id })`, and returns `{ ok, data, eventId }`. Shared result types + `ActionResult<T>` discriminated union.
- `src/types/index.ts` — shared mutation input/result types.
- Companion `.md` for each.
**Done when:** `pnpm typecheck`/`lint`/`test` green; a unit/integration test asserts `commitMapEvent` writes exactly one event row and the payload parses against `mapEventPayloadSchema`.

## Sub-stage 9.2 — System & connection mutation helpers + wormhole lookups
**Mode:** Accept edits
**Goal:** The DB-facing helpers, each a single `commitMapEvent` call.
**Touches:**
- `src/lib/map/mutations/systems.ts` — `addSystem` (insert or flip a hidden `visible=true` row, reusing the `(mapId, systemId)` unique row → `system.added`), `removeSystem` (`visible=false` → `system.removed`; rows persist per CLAUDE.md lifecycle rule — no hard delete), `updateSystem` (alias/tag/status/intelNotes/locked/rallyAt + position → `system.updated`).
- `src/lib/map/mutations/connections.ts` — `createConnection` (`connection.create`), `deleteConnection` (**hard delete** per CLAUDE.md — wormholes don't come back → `connection.delete`), `updateConnection` (scope cycle, massStatus, jumpMassClass, `isEol` stamping `eolAt`, isFrigate, preserveMass, isRolling → `connection.update`).
- `src/lib/map/wormholeTypes.ts` — `wormholeTypesForSystem(systemId)`: filter `universe_wormhole` by the system's `universe_system.securityClass` (`source_class IS NULL OR source_class = <class>`, the latter covering universal K162); `staticMatchForConnection(...)`: match a connection's target class against `universe_system_static` + `universe_wormhole` for "mark as static" (SPEC §6.4). Reuse the join shape from `loadMap.ts:187-201`.
- Companion `.md` for each.
**Done when:** integration tests (real containerized PG) drive each helper and assert row state + exactly one event row + payload shape; wormhole filter returns class-correct codes (+K162).

## Sub-stage 9.3 — Server Actions (low-frequency) + maps-list UI
**Mode:** Accept edits
**Goal:** Map create / soft-delete / settings via Server Actions, wired into the maps list.
**Touches:**
- `src/app/(app)/actions/map.ts` — `createMapAction` (`map.create`), `deleteMapAction` (sets `deleted_at`, two-phase per CLAUDE.md → `map.delete`), `updateMapSettingsAction` (name/icon/flags → `map.update`). All: `requireSession`, Zod-validate, call `commitMapEvent`, `revalidatePath`.
- `src/app/(app)/maps/page.tsx` + a `src/components/maps/*` create/delete dialog (shadcn) — buttons wired to the actions.
- Companion `.md` for each.
**Done when:** a logged-in character can create and soft-delete a map from the list; list refreshes via `revalidatePath`; soft-deleted maps drop out of `listViewableMaps`.

## Sub-stage 9.4 — JSON API routes (high-frequency) + wormhole-types endpoint
**Mode:** Accept edits
**Goal:** The high-frequency client-initiated pathway.
**Touches (under `src/app/api/map/`):**
- `[mapId]/systems/route.ts` (POST add), `[mapId]/systems/[systemId]/route.ts` (PATCH update incl. drag position, DELETE remove).
- `[mapId]/connections/route.ts` (POST), `[mapId]/connections/[connId]/route.ts` (PATCH, DELETE).
- `[mapId]/signatures/route.ts` (POST), `[mapId]/signatures/[sigId]/route.ts` (PATCH, DELETE).
- `[mapId]/wormhole-types/route.ts` (GET — dropdown filtered via `wormholeTypesForSystem`).
- All: `requireSession` (interim-open note → Stage 15), Zod-validate body, call the 9.2 helper, return `{ ok, data, eventId }` JSON. Validate `mapId`/ids are well-formed and the map isn't soft-deleted.
- `src/app/api/map/README.md` — the mutation-pathways doc CLAUDE.md references.
- Companion `.md` for each route.
**Done when:** each endpoint exercised by integration test; exactly one `ap_map_event` per call; a `LISTEN` test confirms the broadcast fires.

## Sub-stage 9.5 — Client realtime apply (reducer)
**Mode:** Accept edits
**Goal:** The canvas applies live events from other tabs — no edit affordances yet.
**Touches:**
- `src/lib/map/applyEvent.ts` — pure reducer `(MapViewData, mapEventPayload) → MapViewData`, one branch per kind (add/remove/update system, create/update/delete connection, signature mutations, map.update/delete). Keyed off the 9.1 payload union.
- `src/components/map/MapCanvas.tsx` — make stateful: seed `useState` from `data` prop, consume `useRealtime().lastEvent`, apply via the reducer, track applied `eventId`s to dedupe. Replace the Stage 8 "applying live updates… is Stage 9" placeholder (`MapCanvas.tsx:36-38`).
- Companion `.md` updates.
**Done when:** unit tests for the reducer per kind; tab B reflects a mutation driven through 9.4 within <500ms; no edit UI yet.

## Sub-stage 9.6 — Editable canvas + optimistic mutations
**Mode:** Plan mode (UI surface, browser-verified, harder to predict)
**Goal:** Full in-browser CRUD with optimistic + reconcile.
**Touches:**
- `src/lib/map/client.ts` — fetch wrapper for the 9.4 routes; optimistic-apply → on success record returned `eventId` (so the realtime echo is deduped) → on error rollback + sonner toast.
- `src/components/map/MapCanvas.tsx` — enable node drag (drag-end → PATCH position, optimistic), connect handles (`onConnect` → POST connection), selection-driven inspector.
- `src/components/map/SystemNode.tsx` / `ConnectionEdge.tsx` — edit affordances (status, alias/tag/intel, rally toggle; connection scope cycle, mass/EOL/frigate/preserve-mass flags, is-rolling).
- `src/components/sidebar/*` or a new inspector + signature module with the WH-type dropdown fed by `[mapId]/wormhole-types`.
- Companion `.md` updates.
**Done when:** Stage 9 roadmap "Done when" met — all map/system/connection/signature CRUD works end-to-end in the browser; two tabs sync edits <500ms with no double-apply; degraded-mode banner behavior from Stage 8 unaffected.

---

## Verification

- **Per sub-stage:** `pnpm typecheck && pnpm lint && pnpm test` green at each checkpoint.
- **Single-commit-point invariant:** integration test asserts every mutation helper produces exactly one `ap_map_event` row (no dual-writes, no app-level `pg_notify`).
- **Realtime round-trip:** a `LISTEN`-based test (extend the Stage 6 trigger test) confirms each mutation fires the channel; a two-tab browser check (or Playwright) confirms <500ms cross-tab propagation and `eventId` dedupe.
- **Broadcast-only invariant:** confirm no client→server WS frame other than subscribe/unsubscribe exists; all mutations go through Server Actions or `/api/map/**`.
- **Wormhole wiring (SPEC §6.4):** test that `wormhole-types` for a C2 system returns only `source_class ∈ {null, 'C2'}` codes incl. K162; "mark as static" matches target class against `universe_system_static`.
- **Lifecycle correctness:** `removeSystem` sets `visible=false` (row persists); `deleteConnection` hard-deletes; `deleteMapAction` sets `deleted_at` (no purge).
