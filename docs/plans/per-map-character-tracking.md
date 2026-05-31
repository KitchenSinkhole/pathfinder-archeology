# Per-Map Character Tracking

**Goal:** Move character location-tracking selection from a global per-character flag (with auto-follow-last-map) to an explicit per-map selection, so a user can track all their characters on a private map but only one character on a corp map.

**Spec references:** `docs/spec/03-backend-api.md` (`updateUserData` / `mapIds[]` tracking semantics), `docs/spec/04-cron-and-background.md` (location poll), CLAUDE.md §Background jobs / §Realtime.

---

## Background — current vs. target model

**Current (global, single last-open map):**
- `ap_character.tracking_enabled` — a **global** per-character boolean, toggled in the header `CharacterPanel`.
- `ap_map_character_tracking` `(map_id, character_id)` — the join table the poll reads. Schema already allows a character on **multiple** maps, and `locationPoll` already fans jumps across every tracked map.
- `trackCharactersOnMap(characterIds, mapId)` (called from the WS `subscribe` handler) **deletes a character's rows on all other maps** — so in practice each character only tracks the *last map opened*. This auto-follow is what blocks per-map tracking.

**Target (explicit per-map selection):**
- The `ap_map_character_tracking` join table is the **single source of truth**: a row ⇔ "track this character on this map." A character may have rows on many maps simultaneously, with a different per-map selection. (The data model already supports this; we stop deleting other-map rows.)
- The global `ap_character.tracking_enabled` flag is **removed**.
- **Default = track all your characters.** The first time an account opens a map, all its active characters are seeded onto that map. After that, the user's exact per-map selection is respected — *including selecting zero*.
- The per-map selection UI lives in the **header Characters panel**, contextual to the currently-open map.

### The "seeded" marker (why a new table)
With the global flag gone and presence-in-table = tracked, an empty selection is ambiguous: *"new map, never configured"* (should auto-add all) vs. *"user deselected everyone"* (must stay empty). A small per-`(map, account)` marker disambiguates:

- `ap_map_tracking_seed (map_id, user_id, seeded_at)`, PK `(map_id, user_id)`.
- First `subscribe` to a map with **no** seed row → insert the marker **and** seed a tracking row for every active account character.
- Subsequent opens see the marker → never auto-add again; the join table stands as-is (including empty).

### User-confirmed design decisions
1. **Global `tracking_enabled` flag → removed.** Pure per-map; the join table is authoritative.
2. **Default on first open of a map → track all the account's active characters** (opt-out per map), gated by the seed marker so it happens exactly once per `(map, account)`.
3. **UI → header Characters panel, contextual.** On a map, each checkbox means "track on *this* map"; the panel header names the map. Off a map there is no current map, so tracking toggles are hidden.

### Data migration stance
Existing `ap_map_character_tracking` rows are artifacts of the old auto-follow, not deliberate selections. **Clean slate:** the finalizing migration truncates `ap_map_character_tracking` and drops `tracking_enabled`; the seed table starts empty. On each client's next reconnect/`subscribe`, every opened map seeds-all under the new default. Tracking re-establishes the moment a map is opened (a deploy restarts the WS, so sockets reconnect and re-subscribe anyway).

---

## Stage 1 — Add seed infrastructure (additive only)
**Mode:** Accept edits
**Goal:** Land the new table and the `seedTrackingForMap` function without changing any existing behavior, so the build stays green and nothing is removed yet.
**Touches:**
- `src/db/schema/ap/map_tracking_seed.ts` (NEW) + `.md` — `ap_map_tracking_seed(map_id → ap_map ON DELETE CASCADE, user_id → ap_user ON DELETE CASCADE, seeded_at timestamptz default now())`, PK `(map_id, user_id)`.
- `src/db/schema/index.ts` (+ `.md`) — re-export the new table.
- `src/db/migrations/00XX_map_tracking_seed.sql` (+ `.rollback.sql`) — **create table only** (additive). Wire `meta/_journal.json` via Drizzle Kit.
- `src/types/index.ts` — re-export inferred row type.
- `src/lib/jobs/tracking.ts` (+ `.md`) — add `seedTrackingForMap({ mapId, userId })`: in one tx, `INSERT … ON CONFLICT DO NOTHING` the seed marker; only when freshly inserted, select the account's **active** character ids, upsert a `(mapId, characterId)` tracking row for each, and enqueue each poll with `preserve_run_at`. No-op when the marker already exists. Leave `trackCharactersOnMap` / `stopAllTrackingForCharacter` in place for now.
**Done when:** migration applies cleanly; `pnpm typecheck` + `pnpm build` green; a unit/integration test shows `seedTrackingForMap` seeds all active chars on first call and is a no-op on the second.

## Stage 2 — Switch behavior + UI to per-map
**Mode:** Accept edits
**Goal:** Flip the active code paths from global auto-follow to explicit per-map selection. After this stage the feature works end-to-end; only the dead global flag remains (removed in Stage 3).
**Touches:**
- `src/lib/realtime/wsServer.ts` (+ `.md`) — `subscribe`: replace the `enabledAccountCharacterIds` + `trackCharactersOnMap` block with `seedTrackingForMap({ mapId, userId })` over the **active** account roster (no `tracking_enabled` filter). Drop the now-unused `enabledAccountCharacterIds` helper.
- `src/app/(app)/actions/character.ts` (+ `.md`) — change `setCharacterTrackingAction` to `(characterId, mapId, enabled)`: `assertCharacterOwnership` + `canViewMap(characterId, mapId)`, then `startTrackingCharacter` (enable) / `stopTrackingCharacter` (disable) for that **single** map; ensure the seed marker exists so disabling the last character can't trigger a re-seed. Add `getMapTrackingAction(mapId)` returning the account's tracked character ids on that map for the panel.
- `src/components/chrome/CharacterPanel.tsx` (+ `.md`) — checkboxes become per-map: on Sheet open while on a map, lazy-fetch the tracked set via `getMapTrackingAction(currentMapId)` and initialize from it; header shows the map name; toggling calls `setCharacterTrackingAction(id, currentMapId, next)`. When **not** on a map, hide tracking toggles (show roster + add/settings/sign-out only).
- `src/components/chrome/AppHeader.tsx` (+ `.md`) and `src/app/(app)/layout.tsx` — stop threading `trackingEnabled` into the panel; adjust `PanelCharacter`.
- `src/lib/jobs/tracking.ts` (+ `.md`) — remove `trackCharactersOnMap` and `stopAllTrackingForCharacter` (now unused).
**Done when:** `pnpm build` green; manual check — opening a fresh map auto-shows all your characters as tracked; unchecking an alt on a corp map persists across reopen; that alt still tracks on a private map; an off-map panel shows no tracking toggles.

## Stage 3 — Remove the global flag, finalize migration, tests & docs
**Mode:** Accept edits
**Goal:** Delete the dead `tracking_enabled` concept, finalize the clean-slate migration, and lock the new behavior with tests.
**Touches:**
- `src/db/schema/ap/character.ts` (+ `.md`) — drop the `trackingEnabled` column.
- `src/db/migrations/00YY_drop_tracking_enabled.sql` (+ `.rollback.sql`) — `ALTER TABLE ap_character DROP COLUMN tracking_enabled` and `TRUNCATE ap_map_character_tracking` (clean slate). Update `meta/_journal.json`.
- `src/lib/jobs/tasks/locationPoll.ts` (+ `.md`) — remove the `tracking_enabled` load and the `'tracking-disabled'` early-exit branch; drop that value from the `stopped` union.
- `src/lib/session.ts` (+ `.md`) — drop `trackingEnabled` from `AccountCharacter` / `getAccountCharacters`.
- `tests/integration/jobs/tracking-toggle.test.ts` — rewrite for per-map semantics: seed-once on first open, per-map add/remove independence, deselect-all persists (no re-seed), poll fans across multiple tracked maps.
- `docs/spec/03-backend-api.md`, `docs/spec/04-cron-and-background.md` — update the tracking description to per-map selection + seed marker; note `tracking_enabled` removal.
- Grep for any lingering `tracking_enabled` / `trackingEnabled` / `trackCharactersOnMap` / `stopAllTrackingForCharacter` references and clean up.
**Done when:** `pnpm build` + `pnpm test` green; no references to the removed symbols remain; spec reflects the per-map model.
