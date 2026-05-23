# Stage 10 — Paste Readers & Connection Lifecycle

**Goal:** §§2–6 of the feature matrix end-to-end (paste-driven chain ops). Wire signature & D-Scan paste readers, surface the connection EOL/lifetime state machine in the canvas, and expose `ap_map_event`-backed signature history. Stage 10 is data-wiring + UI only — the actual reap/expiry crons land in Stage 11 with `graphile-worker`.

**Spec/roadmap:** `docs/plans/rebuild-roadmap.md` Stage 10; SPEC §§5–6 (mutation pathways + lifecycle rules), §6.4 (WH-type resolution); `docs/spec/08-frontend-ui-modules.md:125-163` (legacy `system_signature.js` paste format); feature matrix §§4–5.

## Context

Stage 9 closed the CRUD loop: every system / connection / signature mutation lands as one `ap_map_event`, fans out via `pg_notify` → WS, and the canvas applies the patch (`src/components/map/MapCanvas.tsx`, `src/lib/map/mutations/*`, `src/lib/map/client.ts`). Mass / EOL / frigate / preserve / rolling flags already mutate correctly (`updateConnection` stamps `eol_at` on first true; clears it on false — `src/lib/map/mutations/connections.ts:135-195`). What's missing is the *paste-driven* sig flow EVE players actually use, the EOL/lifetime *visualisation* (timers, "expires in X"), and history surfacing — none of which need new server mutations beyond a bulk-paste endpoint that loops the existing per-sig helpers.

**Decisions (confirmed with user):**
- **Cron deferred to Stage 11.** Stage 10 wires `expires_at` defaults and lifetime constants only; the `graphile-worker` jobs come in Stage 11.
- **Signature history = read-only dialog.** Queries `ap_map_event` filtered to `signature.*` kinds for the system; chronological list, no undo / diff yet.
- **D-Scan = sig-paste tool only.** Paste parses ship & structure type counts and renders them transiently in the dialog; *no* system additions to the map, *no* DB write. Users copy useful info into intel notes by hand.
- **Right-click context menus stay deferred.** The Stage 9 follow-up note remains accurate; Stage 10 does not add canvas-tile context menus.
- **Bulk-paste granularity:** one `ap_map_event` *per signature add/update/delete*, not one mega-event. Keeps history granular, dedupe trivial, and reuses 9.2 helpers verbatim. The bulk route just loops them in a single transaction wrapper for atomicity.
- **Sessioning:** each sub-stage runs in its own Claude Code session — open this file, read the sub-stage, enter its labelled mode (`Shift+Tab`), execute.

## Key facts to reuse (don't re-derive)

- **Per-sig mutations exist:** `createSignature` / `updateSignature` / `deleteSignature` in `src/lib/map/mutations/signatures.ts` already commit one `ap_map_event` each. Bulk paste must loop these, not insert directly.
- **Wormhole catalog lookup exists:** `wormholeTypesForSystem(systemId)` in `src/lib/map/wormholeTypes.ts` filters `universe_wormhole` by `source_class` (+ K162). Sig paste must use the same join shape for WH-code resolution.
- **Universe lookup tables:** `universeGroup.name` (e.g. `'Cosmic Signature'`) and `universeType.name` (e.g. `'Unstable Wormhole'`) — both in `src/db/schema/universe/items.ts`. Sig classifier joins `universe_type → universe_group` and filters by group name.
- **`ap_map_event` partitioned + queryable:** `(map_id, occurred_at)` is the natural index. History queries filter `payload->>'id'` or join through it; payload jsonb already contains `mapSystemId` for sig events (`MapEventPayload.signature.create` body in `protocol.ts:149-160`).
- **Aperture config pattern:** `aperture.config.ts` exports a frozen `apertureConfig` object; UPPER_SNAKE_CASE keys with `_MS` suffix. Existing precedent: `LOCATION_POLL_ONLINE_MS`, `JWK_REFETCH_MIN_INTERVAL_MS`. Companion `aperture.config.md` documents each.
- **TTL relative-time formatting already exists** inline in `src/components/sidebar/SignatureModule.tsx` (renders "23h" / "2d" / "expired"). Extract into the new helper so connection edges can reuse it.
- **Dialog primitive:** shadcn `Dialog` is already in `src/components/ui/*` (used by Stage 9's create / delete map flow — see `src/components/maps/`). Reuse, don't introduce a second modal library.
- **Companion `.md` discipline:** every new/edited `.ts`/`.tsx` gets its companion `.md` in the same change. Shared domain types in `src/types/index.ts`.

---

## Sub-stage 10.1 — Lifetime constants + lifecycle helpers
**Mode:** Accept edits
**Goal:** Centralise the EOL and signature-lifetime constants, extract relative-time rendering into a pure helper, and surface the EOL countdown on connection edges.

**Touches:**
- `aperture.config.ts` (+ `aperture.config.md`) — add `WORMHOLE_EOL_LIFETIME_MS = 15_300_000` (legacy `EXPIRE_CONNECTIONS_EOL = 15300s`), `WORMHOLE_DEFAULT_LIFETIME_MS = 172_800_000` (legacy `EXPIRE_CONNECTIONS_WH = 172800s`), `SIGNATURE_DEFAULT_TTL_MS = 259_200_000` (legacy `EXPIRE_SIGNATURES = 259200s`; matches SPEC §347 "default created_at + 5 days").
- `src/lib/map/connectionState.ts` — pure helpers:
  - `connectionExpiresAt(c: MapConnectionEdge & { eolAt, createdAt }): Date | null` — `eolAt + EOL_LIFETIME` if `isEol`, else `createdAt + DEFAULT_LIFETIME`. Returns `null` for non-WH scopes (`stargate` / `jumpbridge` / `abyssal` never expire).
  - `connectionTimeLeftMs(c): number | null` — `expiresAt - now`, clamped to ≥ 0.
- `src/lib/map/relativeTime.ts` — `formatRelativeFromMs(ms): string` (returns `"23h"` / `"2d"` / `"expired"`). Extracted from the inline logic in `SignatureModule.tsx` so connection edges can reuse it.
- `src/components/map/ConnectionEdge.tsx` — when `isEol`, render a small countdown badge using `connectionTimeLeftMs` + `formatRelativeFromMs`. Uses existing edge-label slot — no new svg primitives.
- `src/components/sidebar/InspectorModule.tsx` — in the `ConnectionInspector` sub-view, show the "Expires in X" line alongside the EOL checkbox.
- `src/components/sidebar/SignatureModule.tsx` — replace the inline TTL render with `formatRelativeFromMs`.
- `src/lib/map/loadMap.ts` — verify `eolAt` and `createdAt` already flow through to `MapConnectionEdge` (the helper needs them); add them to the projection if missing and update `MapConnectionEdge` in `src/types/index.ts`.
- Companion `.md` for each new / edited `.ts`/`.tsx`.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Unit tests cover `connectionExpiresAt` (EOL stamp / non-EOL / non-WH scopes) and `formatRelativeFromMs` (hours / days / expired / negative input).
- Browser: an EOL-flagged WH connection shows a live countdown in the canvas overlay and inspector.

## Sub-stage 10.2 — Signature paste reader (parser + bulk endpoint + dialog)
**Mode:** Plan mode
**Reason for Plan mode:** the EVE-clipboard format is whitespace-fragile (some clients tab-separate, others space-separate; trailing dashes for unknown distance; truncated rows on partial scans), and the diff semantics (`addMissing` × `updateExisting` × `removeMissing`) want a quick design review before file writes. Use the session to confirm the parser test fixtures and the diff matrix before flipping into Accept-edits.

**Touches:**
- `src/lib/map/signatureReader.ts` —
  - `parseSignaturePaste(text: string): ParsedSigRow[]` — split lines, trim, accept tab- or multi-space-separated; tolerate the trailing `-` distance column; skip header / blank / unknown lines. Each row: `{ sigId, groupName, typeName | null, scanStrength | null }`. **No DB calls** — pure.
  - `resolveSignatureRows(rows, systemId): Promise<ResolvedSigRow[]>` — joins `universeGroup` (name → groupId) and `universeType` (name → typeId, scoped by group). For rows whose `typeName` is a WH code (`A239`, `K162`, …), resolve via `universeWormhole.name` instead. Unresolved fields stay null; the sig still gets created (legacy behavior — partial scans are common).
- `src/app/api/map/[mapId]/signatures/bulk/route.ts` —
  - `POST` body: `{ mapSystemId, signatures: ResolvedSigRow[], options: { addMissing: boolean, updateExisting: boolean, removeMissing: boolean } }`.
  - Diffs against existing sigs on the system (`apMapSignature WHERE mapSystemId = ?`), keyed by `sigId`. Routes each diff item through `createSignature` / `updateSignature` / `deleteSignature` — one `ap_map_event` per affected sig.
  - Wraps the loop in a single `db.transaction`; if any per-sig commit throws, the entire paste rolls back. Returns `{ ok, summary: { added, updated, removed, eventIds } }`.
  - New `expiresAt` default = `now + SIGNATURE_DEFAULT_TTL_MS` (from 10.1).
- `src/components/dialogs/SignaturePasteDialog.tsx` — shadcn `Dialog`:
  - Textarea for paste input.
  - Live preview table of parsed rows (sig / group / type / scan-strength), with "unresolvable" rows highlighted.
  - Three checkboxes: "Add new", "Update existing", "Remove missing" (defaults: add ✓ / update ✓ / remove ✗ — matches legacy).
  - Submit button calls the bulk endpoint via a new `pasteSignaturesOnServer` wrapper in `src/lib/map/client.ts`.
- `src/components/sidebar/SignatureModule.tsx` — add a "Paste" button beside "Add"; opens the dialog with the active system pre-bound.
- `src/lib/map/client.ts` (+ `.md`) — add `pasteSignaturesOnServer({ mapId, body }): Promise<ActionResult<BulkSummary>>`.
- Companion `.md` for each new file; update existing `.md` for touched files.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Unit tests: `parseSignaturePaste` covers tab- and space-separated fixtures, header rows, partial rows, mixed WH codes vs group names.
- Integration test: the bulk endpoint, given a paste with 2 new + 1 update + 1 missing (with `removeMissing: true`), produces exactly 4 `ap_map_event` rows and the expected end state.
- Browser: paste a real EVE probe-scanner dump into the dialog; preview matches; submit; sigs appear in the table; other tabs receive the events live.

## Sub-stage 10.3 — D-Scan paste dialog (transient, no DB write)
**Mode:** Accept edits
**Goal:** A read-only intel utility: paste a D-Scan dump, see ship- and structure-type counts. No `ap_map_event`, no schema change.

**Touches:**
- `src/lib/map/dscanReader.ts` — `parseDScan(text): DScanResult` returns `{ ships: Array<{ typeName, count }>, structures: Array<{ typeName, count }>, total: number }`. Pure; groups by EVE category (resolved against `universeGroup` / `universeCategory` server-side via a lightweight loader if needed — but keep the *parser* pure and feed it a `typeNameToCategory` map fetched once per dialog open).
- `src/app/api/map/[mapId]/dscan-classify/route.ts` (optional) — `POST { typeNames: string[] }` returns `{ typeName: { category, groupName } }` map. Server-only because it touches `universeType` / `universeGroup`. Cache responses per `(mapId)` in the client like `fetchWormholeTypes` already does.
- `src/components/dialogs/DScanPasteDialog.tsx` — shadcn `Dialog`. Textarea, on paste fires `parseDScan` + classifier fetch, renders two grouped tables (Ships / Structures) with counts. A "Copy summary" button writes a one-line text summary (`"3 Tengus, 1 Astrahus, 2 Loki"`) to the clipboard so the user can paste it into intel notes.
- `src/components/sidebar/InspectorModule.tsx` — add a "D-Scan" button in the `SystemInspector`; opens the dialog (no map state mutation).
- Companion `.md` for each.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Unit test: `parseDScan` against a fixture EVE D-Scan dump produces the expected counts.
- Browser: paste D-Scan into the dialog → categorized counts render; "Copy summary" puts a useful string on the clipboard; no `ap_map_event` rows are created.

## Sub-stage 10.4 — Signature history dialog (read-only `ap_map_event` view)
**Mode:** Accept edits
**Goal:** Per-system chronological log of every `signature.*` event, rendered from `ap_map_event`. Read-only.

**Touches:**
- `src/lib/map/signatureHistory.ts` — server query:
  - `loadSignatureHistory({ mapId, mapSystemId, limit = 100 }): Promise<SignatureHistoryEntry[]>`.
  - Query: `SELECT id, occurred_at, character_id, kind, payload FROM ap_map_event WHERE map_id = ? AND kind LIKE 'signature.%' AND payload->>'mapSystemId' = ? ORDER BY occurred_at DESC LIMIT ?`.
  - Left-join `apCharacter` for the actor's name; tolerate `null` (character erased — `ON DELETE SET NULL` per CLAUDE.md).
  - Returns `{ id, occurredAt, actorName, kind, payload }`.
- `src/app/api/map/[mapId]/signatures/history/route.ts` — `GET ?systemId=<mapSystemId>&limit=` returning the array. Same `requireSession` + `guardMap` pattern as Stage 9 routes.
- `src/components/dialogs/SignatureHistoryDialog.tsx` — shadcn `Dialog`. Fetches on open; renders a scrollable list ("alice • 2026-05-22 14:23 — added ABC (Cosmic Signature / Wormhole)"). Group consecutive events from the same actor within a minute window for legibility.
- `src/components/sidebar/SignatureModule.tsx` — add a "History" button beside "Paste"; opens the dialog with `system.id`.
- `src/lib/map/client.ts` — `fetchSignatureHistory({ mapId, mapSystemId }): Promise<SignatureHistoryEntry[]>`.
- `src/types/index.ts` — `SignatureHistoryEntry`.
- Companion `.md` for each.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Integration test: seed 3 sig events on a system, fetch the history endpoint, assert order and shape.
- Browser: history button on a sig-active system opens a dialog populated with prior add / update / delete actions for that system; deleted characters show as `"(unknown)"`.

---

## Verification

- **Per sub-stage:** `pnpm typecheck && pnpm lint && pnpm test` green at each checkpoint.
- **Stage 10 gate (roadmap):** SPEC §9 Phase 2 gate — feature matrix §§ 2–6 work end-to-end; a pilot can run a real chain-ops session entirely in-browser (sig paste → live propagation → EOL countdowns visible → history queryable).
- **Single-commit-point invariant preserved:** the bulk endpoint loops 9.2 helpers; *no* new direct `INSERT INTO ap_map_event` paths are introduced. Confirm via grep that `commitMapEvent` remains the only insert call site.
- **No new event `kind` strings:** Stage 10 uses only the 12 kinds seeded in migration 0004. Confirm via grep that `signature.bulk` (or similar) does *not* appear anywhere.
- **Lifecycle correctness:**
  - `connectionExpiresAt` returns `null` for `stargate` / `jumpbridge` / `abyssal` scopes (those connections never expire — the EOL state machine only applies to wormholes).
  - `removeMissing: true` bulk paste deletes sig rows it didn't see; `false` leaves them alone.
  - D-Scan dialog writes nothing to the DB (verify `ap_map_event` count before vs after).
- **Realtime round-trip:** paste of N sigs in tab A produces N `mapUpdate` envelopes in tab B; existing Stage 9 dedupe (`appliedEventIds`) handles the originating tab cleanly.
- **Cron readiness for Stage 11:** the constants in `aperture.config.ts` are the ones Stage 11's reap / EOL-expiry jobs will import — no second source of truth.
