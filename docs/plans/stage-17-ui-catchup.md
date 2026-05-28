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

## Stage 17.3 — Static reference dialogs
**Mode:** Accept edits
**Goal:** System Effects, Jump Info, Shortcuts, Credits — no backend.
**Touches:** `src/lib/eve/systemEffects.ts` (port `docs/spec/system_effect.js` → typed constant), dialogs under `src/components/dialogs/**`. Jump Info reads wormhole mass/statics/compat from `universe_wormhole` + `docs/spec/signature_type.js`.
**Done when:** Each dialog opens and renders correct reference data.

## Stage 17.4 — Map Info + Manual dialogs
**Mode:** Plan mode
**Goal:** Map Info 4-tab snapshot (Summary / Systems / Connections / Users) over existing map data; Manual scrollspy dialog.
**Done when:** Map Info reflects live map counts/systems/connections/pilots; Manual renders with section navigation.

## Stage 17.5 — Account Settings + Delete Account
**Mode:** Plan mode
**Goal:** Server Actions over `ap_user`/`ap_character`; auto-pick-on-login pref; account deletion (cascade).
**Done when:** Settings persist; delete account removes the user and cascades.

## Stage 17.6 — Map Settings + import/export
**Mode:** Plan mode
**Goal:** Consolidated new/edit/settings dialog; reuse admin webhook components; map JSON import/export (`map_import`/`map_export` rights).
**Done when:** Edit/settings persist; export downloads JSON; import recreates systems/connections/signatures.

## Stage 17.7 — Statistics dialog
**Mode:** Plan mode
**Goal:** TanStack Table over `ap_activity_rollup` (Stage 11); period navigation; sparklines; rights-gated Private/Corp/Alliance tabs. **First TanStack Table use.**
**Done when:** Stats render per scope/period with working prev/next.

## Stage 17.8 — Killboard + System Graph modules
**Mode:** Plan mode
**Goal:** `system_killboard` recent-kills feed (reuse Stage 13 `zkb` client; live WS optional); `system_graph` charts over `ap_system_stats` (K-space only).
**Done when:** Killboard lists recent kills for the selected system; graphs render for K-space.

## Stage 17.9 — Thera + Tags + Dotlan modules
**Mode:** Plan mode
**Goal:** Thera eve-scout sync → connections (reuse Stage 13 `evescout`); Tags next-bookmark grid; Dotlan K-space embed/link.
**Done when:** Thera lists eve-scout connections with sync; Tags grid renders; Dotlan shows for K-space.

## Stage 17.10 — Remaining dialogs + library swaps + Phase-4 gate
**Mode:** Plan mode
**Goal:** Connection mass-log detail; API Status; Changelog (Stage 13 GitHub); Notification full-screen dialog; admin HTML tables → TanStack Table; intel notes textarea → Tiptap; drop `empty.js`; Phase-4 gate test suite (SPEC §9).
**Done when:** SPEC §9 Phase 4 gate green — every feature-matrix §§1–14 row not dropped in §8.2 has a working implementation.
