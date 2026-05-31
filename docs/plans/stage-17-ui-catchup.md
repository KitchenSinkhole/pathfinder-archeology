# Stage 17 — UI Modules & Dialogs Catch-up

**Goal:** Bring the remaining spec-06–08 dialogs and modules to *functional-equivalent* feature-matrix
parity (every capability reachable in the consolidated architecture — not a 1:1 legacy replica), swap
the legacy JS libraries (DataTables→TanStack Table, Summernote→Tiptap, PNotify→sonner, Morris→a React
chart lib), and land the manual structure-intel data model.
**Spec references:** `docs/spec/08-frontend-ui-modules.md`, `docs/spec/10-feature-matrix.md` §§1–14,
`docs/spec/SPEC.md` §5.4 (library swaps) + §9 Phase 4 gate.

## Already built — reuse, do not duplicate

| Legacy surface | Lives in the rebuild as |
|---|---|
| `system_info` + `connection_info` *editing* | `src/components/sidebar/InspectorModule.tsx` |
| `system_signature` + paste reader | `src/components/sidebar/SignatureModule.tsx`, `src/components/dialogs/SignaturePasteDialog.tsx` (Stage 10) |
| `system_route` | `src/components/sidebar/RouteModule.tsx` (read-only) |
| Sov / FW / EVE-Scout / zKB links | `src/components/sidebar/IntelModule.tsx` (Stage 13) |
| 24h kill stats | `src/components/sidebar/KillStatsModule.tsx` |
| `map_settings` create | `src/components/maps/CreateMapDialog.tsx`, webhook admin components |
| PNotify toasts | `sonner` (wired everywhere) |

**Dropped (SPEC §8.2):** `empty.js`, `header_login.js` starfield, mail broadcast, plugin scaffolding.
**Dev-only — skip:** `demo.js`.

## Deviation — structure intel is manual entry, not ESI

ESI `getUniverseStructure` only returns structures the calling character can dock at (their own
corp's), so it cannot supply intel on **other** corps' structures — the whole point of the feature.
`ap_structure` is a manual-entry table; the Stage 11.6 `structure-resolve` ESI job was retired in
17.1, not implemented. (Recorded in `rebuild-roadmap.md` Stage 17, `08-frontend-ui-modules.md`
system_intel, `10-feature-matrix.md` row 9.)

---

## Stage 17.1 — Structure data model + retire ESI job  ✅ (this stage)
**Mode:** Accept edits
**Goal:** `ap_structure` manual-intel table exists; the purposeless `structure-resolve` ESI job is removed; deviation documented.
**Touches:** `src/db/schema/ap/structure.ts`, `src/db/migrations/0016_structure.sql` (+ rollback + journal), `src/lib/jobs/registry.ts`; deletes `src/lib/jobs/tasks/structureResolve.{ts,md}` + `tests/integration/jobs/structure-resolve.test.ts`.
**Done when:** typecheck + lint pass; no `structure-resolve` references remain; migration 0016 applies and rolls back cleanly.

## Stage 17.2 — Structure intel UI + CRUD API
**Mode:** Plan mode
**Goal:** Manual structure CRUD reachable from the sidebar.
**Touches:** `src/app/api/map/[mapId]/.../structures/**` (or a system-scoped route), a new `StructureModule.tsx` (or extend `IntelModule`), a structure-type picker reading Upwell types from `universe_type`.
**Done when:** A user can add/edit/delete a structure (system + name + type + owner/notes) and it persists and renders for that system.

## Stage 17.3 — Static reference dialogs  ✅
**Mode:** Accept edits
**Goal:** System Effects, Jump Info, Credits — no backend. (Shortcuts **deferred** — the rebuild has no keyboard-shortcut system yet, so there is nothing to enumerate; build it when a real shortcut layer lands.)
**Touches:** `src/lib/eve/systemEffects.ts` (port `docs/spec/system_effect.js` → typed constant), `src/lib/eve/wormholeJumpInfo.ts` + `src/app/api/reference/wormholes/route.ts` + `src/lib/reference/client.ts`, dialogs under `src/components/dialogs/**`, `src/components/ui/menu.tsx`, `src/components/chrome/ReferenceMenu.tsx`, header/footer wiring. Jump Info is data-backed: wormhole mass + statics-by-source-class from `universe_wormhole` + dogma (`universe_type_attribute_effective`). The legacy hard-coded jump-compatibility matrix was dropped (source HTML absent; the per-WH jump-mass column conveys max ship size).
**Done when:** System Effects, Jump Info, and Credits each open and render correct reference data.

## Stage 17.4 — Map Info + Manual dialogs  ✅
**Mode:** Plan mode
**Goal:** Map Info 4-tab snapshot (Summary / Systems / Connections / Users) over existing map data; Manual scrollspy dialog.
**Done when:** Map Info reflects live map counts/systems/connections/pilots; Manual renders with section navigation.

Built entirely client-side (no `loadMap.ts` / API / schema changes). New `ui/tabs.tsx` primitive (Base UI), `usePresenceForMap` accessor in `MapPresenceContext`, `MapInfoDialog` (triggered from a `MapCanvas` toolbar button, reads live `viewData` + presence), and `ManualDialog` (scrollspy over `src/lib/reference/manual.ts`, launched from `ReferenceMenu`). Summary "created/creator" dropped (not in client data); Users tab is the online presence roster (name/location/ship).

## Stage 17.5 — Account Settings + Delete Account  ✅
**Mode:** Plan mode
**Goal:** Server Actions over `ap_user`/`ap_character`; auto-pick-on-login pref; account deletion (cascade).
**Done when:** Settings persist; delete account removes the user and cascades.

The legacy "auto-pick-on-login" was reframed as a **main-character designation** — Aperture
tracks every character automatically, so the meaningful account-level concept is *which
character is the human's main* (the identity statistics / activity roll up to), not which is
active. `ap_user.main_character_id` (migration `0018`, nullable bigint, FK → `ap_character`
`ON DELETE set null` declared in SQL to avoid a circular schema import). Login **lands on
main**: the jwt sign-in callback resolves `characterId` to the account's main
(`resolveMainCharacter` in `auth.ts`), bootstrapping it to the authenticated character on
first login — so the "add character" flow also returns you to your main. New
`setMainCharacterAction` / `deleteAccountAction` Server Actions (`actions/account.ts`);
delete hard-removes `ap_user` (characters cascade, audit rows `SET NULL`, owned maps
orphaned) and signs out. UI: `AccountSettingsDialog` (roster + role display + set-main) and
type-to-confirm `DeleteAccountDialog`, launched from `CharacterSwitcher`. The actual
*rollup-to-main attribution* for stats/activity is deferred to 17.7 + the Stage 11 rollup job
(they will read `main_character_id`).

## Stage 17.6 — Map Settings + import/export  ✅
**Mode:** Plan mode
**Goal:** Consolidated new/edit/settings dialog; reuse admin webhook components; map JSON import/export (`map_import`/`map_export` rights).
**Done when:** Edit/settings persist; export downloads JSON; import recreates systems/connections/signatures.

New `MapSettingsDialog` (`src/components/dialogs/`) launched from the **map canvas toolbar**
(next to "Map info"), tabbed General / Settings / Export / Import. General + Settings persist via
the existing `updateMapSettingsAction` (`map_update`); a name change reflects live on the canvas via
the realtime `map.update` echo. Export = `GET /api/map/[mapId]/export` (`map_export`) → client builds
the `aperture-map-<id>-<date>.json` download; Import = `POST /api/map/[mapId]/import` (`map_import`)
**merges into the open map** — systems upsert by EVE system id, connections + signatures recreated with
endpoint ids remapped, all under one transaction reusing the `bulkSignatures` commit pattern; returned
payloads fold onto the canvas via the existing `onBulkPaste` handler. Core is `src/lib/map/transfer.ts`
(`buildMapExport` / `importMapData` / `mapExportSchema`); settings pre-fill via new
`loadMapSettings` (loadMap.ts) threaded through the map page. **Decisions:** webhooks stay
admin-only (not in the dialog); `New` map creation stays on the maps list (`CreateMapDialog`) since the
dialog acts on an already-open map; re-import is idempotent for systems but appends connections (no
natural unique key). Covered by `tests/integration/map-import-export.test.ts` (round-trip + remap +
unresolved-endpoint skip).

## Stage 17.7 — Statistics dialog  ✅
**Mode:** Plan mode
**Goal:** TanStack Table over `ap_activity_rollup` (Stage 11); period navigation; sparklines; rights-gated Private/Corp/Alliance tabs. **First TanStack Table use.**
**Done when:** Stats render per scope/period with working prev/next.

Global, **header-launched** dialog (`StatisticsButton` beside `ReferenceMenu` in `AppHeader`) — faithful to
legacy `stats.js`, which ranked characters across all maps of a scope (no mapId). Core reader is
`src/lib/stats/activity.ts` (`resolveStatsAccess` + `loadActivityStats`): resolves in-scope maps via the
existing `viewableMapPredicate`, then one raw `db.execute` over the MV with **main-character
attribution** (`COALESCE(main_character_id, character.id, rollup.character_id)` — alts roll up to the
account main per `ap_user.main_character_id`). `GET /api/statistics?scope&period&anchor` (Zod-validated,
scope-gated 403). UI: `StatisticsDialog` (scope tabs + week/month/year segmented control + prev/label/next),
`StatsTable` (the **first** `@tanstack/react-table` use — rank/portrait/triplets/total/sparkline, sortable),
hand-rolled `Sparkline` (inline SVG, no chart dep — 17.8 picks the real chart lib).

**Decisions / deviations:** the table covers **System / Connection / Signature** triplets only — `map.*`
kinds are excluded as map-lifecycle noise. Drag-only canvas position moves (a `system.updated` whose
payload carries only positionX/positionY) are **not** a contribution and are excluded too: migration
`0023_activity_rollup_moves` re-buckets them to a derived `system.moved` kind inside the MV, which the
reader filters out (`kind NOT LIKE 'map.%' AND kind <> 'system.moved'`). Periods are week/month/year derived
from the weekly MV (each ISO week attributed to its Monday's calendar month/year); legacy day-granular
month/year is gone with the daily `activity_log`. Legacy `LOG_ACTIVITY_ENABLED`-per-scope gating dropped
(the rebuild logs every mutation unconditionally). Null-character (erased) events bucket as an
`(unknown)` row. Covered by `tests/integration/statistics.test.ts` (rollup attribution, scope filter,
period split, unknown bucket, `hasNext` boundary).

## Stage 17.8 — Killboard + System Graph modules
**Mode:** Plan mode
**Goal:** `system_killboard` recent-kills feed (reuse Stage 13 `zkb` client; live WS optional); `system_graph` charts over `ap_system_stats` (K-space only).
**Done when:** Killboard lists recent kills for the selected system; graphs render for K-space.

## Stage 17.9 — Thera module
**Mode:** Plan mode
**Goal:** Thera eve-scout sync → connections (reuse Stage 13 `evescout`).
**Done when:** Thera lists eve-scout connections with sync.

## Stage 17.10 — Auto-tagging module (ABC + 0121)
**Mode:** Plan mode
**Goal:** An **optional** per-map auto-tagging feature that assigns a tag to each newly discovered
system on the map, using one of two pluggable tagging schemes. The architecture must be **extensible** —
adding a third scheme later should not require touching the first two. A side panel surfaces the next
available tags so scanners can bookmark ahead of discovery.

**Prerequisite — Home system:** Both schemes require an admin to configure a **Home** system on the map
(the central node tagging is calculated from). The Home system **cannot be deleted** from the map while
it is designated as Home, and there is exactly one Home per map. Configuring/clearing Home is an
admin-gated map setting.

**Scheme A — `ABC` (per-class sequential letters):**
- Each wormhole class is tagged independently with the next available letter of the alphabet, starting
  at `A`. The first C1 discovered becomes `C1(A)`, the next `C1(B)`, then `C1(C)`, etc. — each class
  (C1, C2, … C6, plus the other WH-space classes) keeps its own independent letter sequence.
- Letters are reclaimed on deletion: if `C1(B)` is removed, `B` becomes the next available letter for
  that class and is reused before `C`/`D`/etc. (always assign the **lowest** free letter).
- The UI panel shows the **next three available letters per class** to help scanners bookmark.

**Scheme B — `0121` (positional chain numbering):**
- Each system in a chain hanging off Home is numbered by the order it was discovered *as a child of its
  parent*, with the digit appended to the parent's tag. The first hole discovered off Home is `1`.
  - `1` → first hole off Home
  - `11` → first hole off `1`; `12` → second hole off `1`
  - `111` → first hole off `11`; `121` → first hole off `12`
  - `1111`, `1112`, `11121`, … and so on, depth-first by parent.
- A tag is therefore `parent_tag` + `next_unused_child_index` (child indices start at 1; the root level
  hangs directly off Home). Indices are reclaimed per-parent when a child system is deleted (assign the
  lowest free index for that parent).
- The UI panel shows the next available tag(s) for the relevant parent(s).

**Assignment trigger & topology:** A tag is assigned when a system is *newly added* to the map. `0121`
depends on the connection topology (parent = the system you came from), so the scheme must resolve a
system's parent from its connection to an already-tagged system (or Home). Re-tagging on later topology
changes is out of scope for this stage unless trivially free — assignment is at discovery time.

**Touches (indicative — finalize in plan mode):** map-level config for tagging scheme + Home system
(schema migration on `ap_map`, or a small `ap_map_tagging` table; new enum `tag_scheme` = `none|abc|0121`);
a tag column/store on `ap_map_system` (the assigned tag string); a `src/lib/tagging/**` core with a
**strategy interface** (`nextTag(context)` / `availableTags(context)`) and one module per scheme so a
third scheme is additive; hook into the system-create mutation pathway (Server Action / API) so tags are
assigned on discovery and reclaimed on delete; a `TagsModule` side panel rendering next-available tags;
Home-system delete guard (reject delete while designated Home); admin map-settings UI for scheme + Home.

**Done when:** An admin can set a map's tagging scheme and designate a Home system; newly discovered
systems receive the correct `ABC` or `0121` tag; deleting a tagged system frees its tag/index for reuse;
the Home system cannot be deleted while designated; the side panel shows the next available tags for the
active scheme; adding a hypothetical third scheme requires only a new strategy module.

## Stage 17.11 — Remaining dialogs + library swaps + Phase-4 gate
**Mode:** Plan mode
**Goal:** Connection mass-log detail; API Status; Changelog (Stage 13 GitHub); Notification full-screen dialog; admin HTML tables → TanStack Table; intel notes textarea → Tiptap; drop `empty.js`; Phase-4 gate test suite (SPEC §9).
**Done when:** SPEC §9 Phase 4 gate green — every feature-matrix §§1–14 row not dropped in §8.2 has a working implementation.
