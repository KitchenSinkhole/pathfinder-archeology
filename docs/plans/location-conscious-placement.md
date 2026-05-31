# Location-Conscious System Placement

**Goal:** Stop systems from being added or dropped on top of each other, and place auto-added systems in an open spot next to the system they connect from instead of piling up at the origin.

**Spec references:** Mutation pathways in `CLAUDE.md` §"Mutation pathways"; map engine `src/components/map/MapCanvas.md`; legacy precedent `docs/spec/07-frontend-map-engine.md` (`findNonOverlappingDimensions`).

---

## Context

Three problems, all rooted in the fact that nothing in Aperture is aware of where other systems already sit:

1. **Auto-added systems stack at (0,0).** When the location poll detects a wormhole jump, `foldWormholeJumpOntoMap` → `ensureSystemVisible` inserts the destination system **with no `positionX/Y`**, so it falls to the column default `(0,0)` (`src/lib/jobs/locationCommit.ts:91`, `src/db/schema/ap/map_system.ts:33-34`). Every jump-discovered system lands on the same pile, far from the system it was reached through.
2. **Manual adds can overlap.** `onAddSystem` drops the node at viewport-centre + ±40px jitter with no awareness of existing nodes (`src/components/map/MapCanvas.tsx:246-269`).
3. **Drags can bury nodes.** `onNodeDragStop` persists the raw drop coordinates; you can drop one node squarely on another (`src/components/map/MapCanvas.tsx:201-223`). There is no collision/overlap logic anywhere, and xyflow runs without grid snapping.

**Intended outcome:** a shared, framework-free placement helper that, given an anchor point and the set of currently-occupied node rectangles, returns the nearest open, grid-aligned slot. All three placement paths route through it. New jump systems appear adjacent to their parent; manual adds and drags settle into the nearest free grid cell instead of overlapping.

**Decisions (confirmed with user):**
- Overlap on drag → **nudge the dropped node** to the nearest free slot (one node moves, one write).
- **Snap to grid** for all placement (auto, manual, drag) plus live xyflow drag snapping.
- Apply to **all three** paths: jump auto-add, manual add dialog, drag/move.

---

## Stage 1 — Shared placement helper
**Mode:** Accept edits
**Goal:** A pure geometry module usable by both server (jobs) and client (React), with no `server-only`/React/DB imports so it can run anywhere and be unit-tested.
**Touches:** `src/lib/map/placement.ts` (new) + `src/lib/map/placement.md` (new)

Export:
- Constants (tune during implementation; starting values):
  - `GRID_SIZE = 25` — snap granularity.
  - `NODE_WIDTH = 180`, `NODE_HEIGHT = 60` — collision footprint (covers `min-w-36`≈144px plus the optional statics line and a margin).
  - `PLACEMENT_GAP = 20` — minimum empty space between nodes.
  - `SLOT_X = NODE_WIDTH + PLACEMENT_GAP` (200), `SLOT_Y = NODE_HEIGHT + PLACEMENT_GAP` (80) — ring step, grid-aligned.
- `type Point = { x: number; y: number }`, `type Rect = Point` (top-left; width/height implied by constants). Keep these local to the module — they are geometry primitives, not domain types, so they do **not** go in `src/types/index.ts`.
- `snapToGrid(p: Point): Point` — round to `GRID_SIZE`.
- `overlaps(a: Point, b: Point): boolean` — true when `|a.x-b.x| < SLOT_X && |a.y-b.y| < SLOT_Y` (footprint + gap).
- `findOpenPosition(anchor: Point, occupied: Point[], opts?): Point` — snap the anchor, then spiral outward in `SLOT_X`/`SLOT_Y` steps (ring radius 0,1,2,…), returning the first grid-aligned candidate that `overlaps` nothing in `occupied`. Prefer the candidate nearest the anchor on each ring (and prefer below/right on ties so growth reads naturally). Cap rings (e.g. 50) and fall back to the last candidate if somehow saturated.

Reuse note: this generalises what `thera.ts` does ad hoc (`hubBasePosition` + the fan loop, `src/lib/map/thera.ts:157-226`). Optionally re-point Thera's `HUB_GROUP_SPACING`/`TARGET_FAN_RADIUS` at these constants later; not required for this feature.

**Done when:** module compiles, is import-clean from both a server job and a client component, and `findOpenPosition` returns a non-overlapping snapped point for hand-checked inputs (e.g. anchor with a fully-occupied first ring spills to the second).

---

## Stage 2 — Server: place jump-discovered systems next to their parent
**Mode:** Accept edits
**Goal:** New systems from a detected jump land in an open slot anchored on the system the pilot came from; never at (0,0) on a populated map.
**Touches:** `src/lib/jobs/locationCommit.ts` + `src/lib/jobs/locationCommit.md`

- Change `ensureSystemVisible` to accept an optional `anchorSystemId?: number`. When it is about to **insert a new** row (the non-`existing?.visible` branch):
  1. `SELECT positionX, positionY FROM ap_map_system WHERE mapId = … AND visible = true` → the `occupied` list.
  2. Resolve the anchor: if `anchorSystemId` is given and visible, use its position; else fall back to the centroid of `occupied` (or `{x:0,y:0}` when the map is empty).
  3. `pos = findOpenPosition(anchor, occupied)`.
  4. Insert with `positionX: pos.x, positionY: pos.y`.
- In `foldWormholeJumpOntoMap`: ensure the **from** system first (no anchor — origin/centroid is fine), then ensure the **to** system with `anchorSystemId = fromSystemId` so it fans off the parent's real position.
- Leave the `onConflictDoUpdate` re-add branch untouched — it must keep preserving a hidden system's prior position (matches the existing comment at `locationCommit.ts:94` and Thera's behaviour). Only fresh inserts get computed placement.

**Done when:** simulating two consecutive jumps onto a map with an existing visible parent yields destination rows with distinct, non-overlapping positions adjacent to the parent (verify via DB query or the dev-server map), and re-adding a previously-hidden system still restores its old coordinates.

---

## Stage 3 — Client: location-aware manual add + drag nudge + grid snap
**Mode:** Accept edits
**Goal:** Manual adds drop into the nearest open slot (near the selected system if one is selected, else viewport centre); dragging a node onto others nudges it to the nearest free slot; live dragging snaps to grid.
**Touches:** `src/components/map/MapCanvas.tsx` + `src/components/map/MapCanvas.md`

- **Occupied set helper (local):** derive `occupied` from `viewData.systems` (`{x: positionX, y: positionY}`), excluding the node being moved where relevant.
- **`onAddSystem`** (`MapCanvas.tsx:246-269`): anchor = the currently-`selected` system's position when `selected.kind === 'system'`, else the snapped viewport centre via `screenToFlowPosition`. Replace the ±40px jitter with `findOpenPosition(anchor, occupied)`; send the resulting `positionX/Y` to `addSystemOnServer`.
- **`onNodeDragStop`** (`MapCanvas.tsx:201-223`): snap the drop point to grid; build `occupied` from all *other* systems. If the snapped point `overlaps` any, replace it with `findOpenPosition(snappedDrop, occupiedOthers)` (search starts at the drop point so the nudge is minimal). Persist the final snapped/nudged coordinates through the existing `runOptimistic` + `updateSystemOnServer` path; put the same coordinates in the optimistic `system.updated` payload so the reconcile effect (`MapCanvas.tsx:439-458`) settles the node into the nudged slot.
- **Live snapping:** add `snapToGrid` and `snapGrid={[GRID_SIZE, GRID_SIZE]}` to the `<ReactFlow>` element (`MapCanvas.tsx:581-609`).

**Done when:** in the running app, adding a system with a node selected drops it in an open slot beside that node; adding with nothing selected drops near viewport centre without overlap; dragging a node on top of another releases it into the nearest free slot; dragging feels grid-aligned; all changes persist across reload and fan out to a second tab.

---

## Critical files

| File | Role |
|---|---|
| `src/lib/map/placement.ts` (new) | Pure helper: constants, `snapToGrid`, `overlaps`, `findOpenPosition`. |
| `src/lib/jobs/locationCommit.ts` | Anchor jump-discovered systems on their parent; compute open slot on insert. |
| `src/components/map/MapCanvas.tsx` | Manual-add anchoring, drag nudge, xyflow grid snap. |
| `src/lib/map/thera.ts` | Existing location-aware precedent; optional later constant-sharing only. |

Companion `.md` files must be created/updated alongside every `.ts`/`.tsx` edit (standing instruction in `CLAUDE.md`).

---

## Verification

1. **Typecheck/lint/build:** run the project's build + lint (`npm run build`, `npm run lint` or equivalent) — must be clean.
2. **Unit (placement.ts):** if a test runner is present (vitest/jest), add focused tests for `findOpenPosition` (empty map returns snapped anchor; first ring full spills outward; results never `overlaps` an input) and `snapToGrid`. The module is pure, so this needs no DB or React.
3. **Server path (jumps):** with the dev server + a tracked character (or by directly invoking `foldWormholeJumpOntoMap` against a seeded map), confirm sequential jumps create destination rows with distinct, parent-adjacent positions — never `(0,0)` on a populated map — and that re-showing a hidden system keeps its old coordinates.
4. **Client paths:** use the `run` skill / dev server to exercise manual add (with and without a selected system), and drag-onto-another (expect a minimal nudge to the nearest free slot). Confirm grid-snapped feel, persistence across reload, and cross-tab fan-out.
