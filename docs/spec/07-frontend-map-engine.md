# 07 — Frontend Map Engine

**Stage G output.** Documents the jsPlumb-based map canvas at the heart of Pathfinder: the multi-map tab shell (`module_map.js`), the renderer (`map.js`), the system-node lifecycle (`system.js` plus tile DOM helpers), the connection lifecycle (drag, type cycling, mass / EOL flags, K162 endpoint labels), the auxiliary modules (contextmenu, layout, local pilots, magnetizer, scrollbar, overlay system), and the integration with the realtime SharedWorker transport described in Stage F.

Stage F ([06-frontend-architecture.md](06-frontend-architecture.md)) already covered the SharedWorker / WebSocket façade (`js/app/map/worker.js`) and the polling heartbeats — those pieces are referenced here but not re-described. UI modules and dialogs that dock around the canvas (`module/system_info`, `module/connection_info`, `dialog/system`, etc.) are Stage H. The server side of the realtime channel and the cron-driven map cleanup are in [04-cron-and-background.md](04-cron-and-background.md). Endpoint shapes for `/api/Map/*`, `/api/System/*`, `/api/rest/Connection`, `/api/rest/Signature`, `/api/rest/Log`, `/api/rest/SystemSearch`, `/api/rest/Route` are in [03-backend-api.md](03-backend-api.md). Database fields backing every position / type / signature / activity row are in [02-data-model.md](02-data-model.md).

## Module layout

| File | LOC | Role |
|---|---|---|
| `js/app/module_map.js` | 1,837 | Tab shell that owns the per-character set of open maps, the surrounding module grid, and the data-pump that feeds `map.js`. |
| `js/app/map/map.js` | 3,441 | Main renderer. jsPlumb instance management, draw/update pipeline, drag handling, event interceptors, save callbacks. |
| `js/app/map/system.js` | 839 | System-node dialogs (add / rally / delete) and head-DOM factory helpers. |
| `js/app/map/util.js` | 2,301 | The map's "stdlib": jsPlumb type registration, connection-type predicates, signature/endpoint helpers, geometry, system/connection visibility, scope/effect/info lookups. |
| `js/app/map/contextmenu.js` | 314 | Four right-click menus (background / system / connection / endpoint), Mustache-rendered, velocity animations. |
| `js/app/map/layout.js` | 531 | `Position.findNonOverlappingDimensions` — elliptical-spiral spawn-point search for new systems. |
| `js/app/map/local.js` | 624 | "Local pilots" sidebar — DataTable of nearby characters keyed by jump distance, triggered by `pf:updateLocal`. |
| `js/app/map/magnetizing.js` | 223 | Farahey 1.1.2 wrapper: per-map instance cache, locked-system filter, grid constrain, hard viewport bounds. |
| `js/app/map/scrollbar.js` | 311 | mCustomScrollbar wrapper: dual-axis momentum scroll, auto-scroll edges, center-element helper. |
| `js/app/map/overlay/overlay.js` | 897 | Connection overlays (arrow, WH timer, EOL, signature labels), map-level info / counter / zoom overlays. |
| `js/app/map/overlay/util.js` | 114 | Overlay DOM lookup helpers and the shared overlay-ID / CSS-class config. |
| `js/app/map/worker.js` | 153 | SharedWorker façade — documented in [06-frontend-architecture.md](06-frontend-architecture.md#sharedworker--websocket-transport). |

## `module_map.js` — tab shell and module grid

The mappage hosts **one tabbed area per character** containing every map the character has access to. `module_map.js` owns this shell. `mappage.js` calls `ModuleMap.updateMapModule(mapModule)` after every successful AJAX cycle (the data is already in `Util.getCurrentMapData()`); the module diffs current tab DOM against the data and adds / removes / refreshes tabs.

### Tab lifecycle

`updateMapModule(mapModule)` is the central reducer:
1. On first call, `newMapTabsElement()` constructs the tab bar `<ul>` plus the "add" and "settings" tabs, then iterates `currentMapsData` and calls `addTab(mapModule, mapData)` for each map.
2. On subsequent calls it computes the set of map IDs that disappeared (→ `deleteTab(tabContent)`), appeared (→ `addTab(...)`), or changed (→ `updateTabData(...)` to refresh the tab icon / name / "shared" badge).
3. `showDefaultTab(mapModule)` picks the active tab by precedence: URL fragment > last-active from IndexedDB > first map.
4. When a tab becomes active, `Map.loadMap(area, mapConfig)` is called and the canvas is drawn.

Tab order is reorderable via Sortable.js; the resulting `[mapId, mapId, …]` ordering is persisted per character in IndexedDB (`map_tabs_left` / `map_tabs_right` depending on side menu).

### Module grid

Each tab body is divided into three CSS-grid areas (`a`, `b`, `c`) where dockable side modules (`module/system_info`, `module/system_signature`, `module/system_intel`, etc.) live. `getModules()` resolves the default module list, plus any plugin module discovered async. `renderModules(modules, tabContentElement, data)` positions each enabled module into its stored area and calls the module's `handle('render', mapId, payload)`. `removeModules()` runs the reverse velocity animation and destroys the instance.

The settings popover (right-side menu → "Map settings") drives this: an editable checklist per map of enabled modules, a 2-col-vs-3-col layout toggle with SVG preview buttons, and per-area drag-handles. Both the disabled-module set and the layout choice are stored in IndexedDB keyed by `mapId`.

### Event bus

`module_map.js` wires a small jQuery-event bus on each tab body:

| Event | Direction | Triggered by | Consumed by |
|---|---|---|---|
| `pf:renderGlobalModules` | Tab → modules | Tab activation, map data refresh | Global modules (`global_thera`, `dotlan`, `tags`, …). |
| `pf:renderSystemModules` | Tab → modules | System click in `map.js` | Per-system modules (`system_info`, `system_signature`, `system_intel`, `system_killboard`, `system_route`, `system_graph`). |
| `pf:renderConnectionModules` | Tab → modules | Connection click in `map.js` | `connection_info`. |
| `pf:updateSystemModules` | Tab → modules | Server-driven system change | Same as `pf:renderSystemModules`, patches DOM in place. |
| `pf:updateRouteModules` | Tab → modules | Route recompute | `system_route`. |
| `pf:updateLocal` | mapContainer | Realtime user-data push | `local.js` `updateLocalTable`. |
| `pf:removeSystemModules` / `pf:removeConnectionModules` | Tab → modules | Deselect | Each module's teardown. |

These events let `map.js` stay agnostic of the docked modules; modules in turn never reach into the jsPlumb canvas directly.

### Tab data collection

`getMapModuleDataForUpdate(mapModule, filter)` walks every tab and asks `Map.getMapDataForSync(mapContainer, filter, minimal)` for each. The aggregated payload is what `mappage.js` POSTs to `/api/Map/updateData` on the heartbeat. Performance logging emits `keyClientMapData` per cycle (consumed by the Task Manager dialog in Stage F).

## `map.js` — renderer

### Public surface

| Export | Purpose |
|---|---|
| `getMapInstance(mapId)` | Singleton accessor; returns or constructs the jsPlumb instance for a given map. |
| `loadMap(area, mapConfig, options)` | Async (re)load — clears the area, draws every system + connection, attaches event handlers. |
| `updateMap(mapContainer, mapData, options)` | Apply a server data delta to an already-drawn map. |
| `updateUserData(mapElement, userData)` | Apply a realtime "where are the pilots" payload from the SharedWorker. |
| `getMapDataForSync(mapContainer, filter, minimal)` | Collect the client-side state (positions, locked flags) for upload. |
| `drawConnection(map, connectionData, options)` / `saveConnection(connection, callback)` | Lower-level connection helpers used both internally and by the contextmenu. |
| `saveSystemCallback(...)` / `drawSystem(...)` | System counterparts. |

### jsPlumb instance configuration

`getMapInstance(mapId)` constructs the per-map jsPlumb instance with:
- **Anchors:** `Continuous` (with allowed faces `top / right / bottom / left`) so jsPlumb auto-picks the closest face per drag.
- **Connector:** `Bezier` with project-tuned curviness.
- **Endpoint types** registered from `Init.endpointTypes` — source endpoint and target endpoint are both small `Dot` (5 px radius), differentiated only by interaction (drag-source vs drop-target).
- **Connection types** registered from `Init.connectionTypes` — the canonical list of every state class the map applies as a jsPlumb "type" (described in [Connection lifecycle](#connection-lifecycle) below).
- **Event interceptors:**
  - `beforeDrop` — rejects loops (source === target), enforces single connection per endpoint, auto-applies `abyssal` scope when either end is an Abyssal system (`typeId === 3`), prompts via Bootbox if a second connection between the same pair would be created.
  - `connectionDetached` — bridge to `/api/rest/Connection` DELETE.
  - `click` — selects the connection, fires `pf:renderConnectionModules`, applies `state_active` type to the connection and a complementary state to its endpoints.
  - `contextmenu` — opens the connection or endpoint menu via `MapContextMenu.openMenu(...)`.
  - `zoom` — persists the zoom level to per-map IndexedDB.

### Draw / update pipeline

```
loadMap(area, mapConfig)
  ├─ getMapInstance(mapId).setSuspendDrawing(true)
  ├─ for each system in mapData.data.systems:
  │     drawSystem(map, systemData) ──► System tile DOM ──► map.makeSource(...) + map.makeTarget(...)
  │                                                       ──► Magnetizer.addElement(mapId, system)
  ├─ for each connection in mapData.data.connections:
  │     drawConnection(map, connectionData) ──► map.connect({source, target, scope}) ──► applyConnectionTypes(...)
  │                                                                                  ──► overlays (arrow, WH timer, signature labels)
  ├─ map.setSuspendDrawing(false, true)      ← single repaint
  └─ attach map-background contextmenu, drag-select frame, scrollbar
```

`updateMap(...)` is the same shape but acts diff-style: it compares `currentMapData` to the incoming payload by ID, computes add / remove / change sets, and applies them in one suspended batch. `MapOverlayUtil.isMapCounterOverlayActive()` is checked first — when the update-counter pie chart is mid-animation, the update is **skipped**, preventing a visible re-snap mid-tick.

### Drag, snap, magnetize

`setSystemObserver(map, system)` wires drag behaviour onto each system:
- `map.draggable(system, { filter, snapThreshold, grid })` — `filter` restricts drag-initiation to the system **head** element so the body's pilot list isn't a drag handle.
- `start` — hide tooltips, raise z-index counter so the dragged system stays above peers, disable pointer-events on connections.
- `drag` — invoke `Magnetizer.executeAtEvent(map, e)` to push adjacent systems out of the way (only when the right-menu "Magnetizer" toggle is on).
- `stop` — re-enable pointer-events, call `markAsChanged()` on each moved system so the next heartbeat uploads the new position.

Snap-to-grid is implemented by adding the `mapGridClass` to the map container; the magnetizer wrapper detects that class and enables a `gridConstrain` callback (20 px lattice).

### Selection and multi-edit

`DragSelect` (from `app/lib/dragSelect.js`) draws a marquee on the map background. `setSystemSelect(system, select)` and `toggleSystemsSelect(map, systems)` add or remove the system from `map.addToDragSelection(...)` so subsequent drags move the whole set. Multi-delete and bulk context-menu actions iterate the same set.

## System-node lifecycle (`system.js` + `map.js`)

### Tile DOM structure

Every system tile has three logical regions:

```
┌────────────────────────────────────────────────────────────────┐
│ Head: [sec] [tag] [name(editable)] [counter] [lock] [effect] ▾ │
├────────────────────────────────────────────────────────────────┤
│ Info (optional): [drifter|shattered]  [statics …]              │
├────────────────────────────────────────────────────────────────┤
│ Body (collapsed by default, expands on hover):                 │
│   pilot row × N — status circle + name + ship type             │
└────────────────────────────────────────────────────────────────┘
```

The **head** is the drag handle and the jsPlumb endpoint surface. The **info** line is produced by `System.getHeadInfoElement(data)` — left side shows drifter / shattered icons and the region name for K-space; right side lists static wormhole classes (e.g. `C247 · N062`). The **body** is hidden until hover and lists pilots currently in the system (rendered from `updateUserData`).

Name editing uses x-editable; Abyssal systems are rendered in the **Triglivian** font (`pf-font-triglavian`) to preserve in-game UX. Aliases and tags are persisted via `/api/System/saveData`.

### Add system — `showNewSystemDialog(map, options, callback)`

The dialog:
- Prefills with the active character's current ESI location (when `AUTO_LOCATION_SELECT` is on).
- Disables every system already on the active map so the operator can't duplicate.
- Uses `/api/rest/SystemSearch` for autocomplete.
- On select, fetches persistent system data (alias, signature count, last-modified) so the dialog can show "you visited this before" hints.
- On submit, calls `Util.request('PUT', 'System', [], formData)`. The callback runs `saveSystemCallback(map, data)` → `drawSystem(map, data)`; if the dialog was opened from a "drag from existing system" flow, `drawConnection(map, …)` is also called so the new system arrives pre-linked.

Spawn position comes from `Layout.Position.findNonOverlappingDimensions(...)` (see below) seeded at the source system or, if no source, the click point.

### Rally point — `showRallyPointDialog(system)`

Toggle four poke channels (Desktop notification / Slack / Discord / Mail) and an optional message. The form behaviour disables the message field when no channels are checked.

When saved, the system's `data('rallyUpdated', 1)` is set and the per-`(mapId, systemId)` rally state is persisted in IndexedDB. The IndexedDB store exists specifically to suppress duplicate Desktop notifications: if the rally has already been seen locally, subsequent incoming map updates won't re-fire the notification. Slack / Discord / Mail are dispatched server-side via the broadcasts documented in [05-external-integrations.md](05-external-integrations.md).

### Lock and delete

`toggleLockSystem(system)` adds the `pf-system-locked` class, removes the draggable, and calls the server. Locked systems are skipped by the magnetizer.

`showDeleteSystemDialog(map, systems)` is a Bootbox confirm; on accept it issues a DELETE to `/api/rest/System` and runs `removeSystems(map, systems)`, which: removes connections incident to each system, unregisters each from the magnetizer, runs a velocity fade-out, and destroys the popover/tooltip handles.

## Connection lifecycle

The biggest piece of map state. A connection in Pathfinder is **a single edge with multiple stacked jsPlumb "type" classes** — there is no enum field; every property is a type that can be added or removed independently except where mutually-exclusive (mass status, jump mass).

### Creation by drag

1. User mouse-downs on a system head; jsPlumb spawns a transient connection following the cursor.
2. On drop, the `beforeDrop` interceptor runs the validation chain (loop check, single-attach, abyssal-scope auto-apply, duplicate-pair confirm).
3. If accepted, the connector materialises and `saveConnection(connection, callback)` is invoked. This PUTs a minimal `{source, target, scope}` payload to `/api/rest/Connection`. The server **re-derives the scope** based on real EVE jump distance: same constellation with a stargate → `stargate`; configured corp jumpbridge present → `jumpbridge`; abyssal at either end → `abyssal`; otherwise `wh`. The response carries the canonical scope plus a server-assigned `connectionId`.
4. `updateConnection(connection, newData)` compares the response to the optimistic client state and patches: it removes the placeholder type, adds the canonical type list, and rebinds the endpoint overlays via `getConnectionDataFromSignatures()`.

If `source` or `target` changes (e.g. someone else dragged the same connection on another tab), jsPlumb tears down the endpoints and recreates them, so the endpoint-overlay rebuild step always re-runs.

### Type vocabulary

Types live in `Init.connectionTypes` and are CSS classes applied to the SVG connector / its endpoints. The vocabulary covers four orthogonal axes:

| Axis | Types | Mutual exclusion |
|---|---|---|
| **Scope** (one of) | `wh`, `wh_fresh`, `wh_reduced`, `wh_critical`, `stargate`, `jumpbridge`, `abyssal` | one scope active at a time |
| **Mass status** (WH only) | `wh_fresh`, `wh_reduced`, `wh_critical` | one at a time — `setConnectionMassStatusType` enforces via `setUniqueConnectionType` |
| **Jump mass** (WH only) | `wh_jump_mass_s`, `wh_jump_mass_m`, `wh_jump_mass_l`, `wh_jump_mass_xl` | one at a time |
| **Toggles** | `wh_eol`, `preserve_mass`, `wh_rolling`, `frigate` | independent |
| **Selection / process state** | `state_active`, `state_process` | ephemeral, set by UI only |

`MapUtil.filterDefaultTypes(types)` strips `['', 'default', 'info_signature', 'state_active', 'state_process']` before any save so transient UI types are never persisted. `MapUtil.allConnectionMassStatusTypes()` / `allConnectionJumpMassTypes()` are the canonical predicates used wherever mutual exclusion matters.

### K162 and signature-driven endpoint labels

Endpoint overlays are how Pathfinder shows which signatures inside the source and target systems correspond to a wormhole connection. The label content comes from `connectionData.signatures`, an array of signature IDs (or "K162" as the literal token).

- `getConnectionDataFromSignatures(connection, connectionData)` walks signatures on both ends, builds a stable hash for change detection, and produces a `{source, target}` label tuple.
- `formatEndpointOverlaySignatureLabel(signatureLabel, options)` renders the label as a coloured `<span>` — red if no signature is assigned, lighter grey for K162 (since K162 inherits its identity from the partner side), wormhole-security-class colour when a single named wormhole is matched.
- `getEndpointOverlaySignatureLocation(face)` computes the (x,y) offset of the label based on the anchor face (top/right/bottom/left) so labels never sit on top of the connector.
- A connection can be **size-locked**: when the wormhole has been identified by its signature label, the jump-mass class is derived from the static wormhole table (`Init.wormholes[label]`) and the contextmenu's manual size override is disabled (see `overlay.js:213`).

K162 arrow direction: the directional arrow overlay on the connector points away from the K162 side (i.e. towards the **named** wormhole side). The flip is decided at overlay-build time in `overlay.js:154-178`.

### Save / delete pipeline

`MapUtil.deleteConnections(connections, callback)` is the single delete path. It:
1. Sets `state_process` on each connection so the SVG fades to a "pending delete" style.
2. Issues a single DELETE to `/api/rest/Connection` with the batch of IDs.
3. On success, removes each connection from the map.
4. Guards every step with `if (connection._jsPlumb)` because a concurrent server-driven update may have already torn down the same connection (this race is the source of several "TypeError: Cannot read property…" reports in older logs).

## `map/util.js` — grouped helper inventory

`util.js` is to the map what `app/util.js` is to the page. Inventory by purpose:

- **jsPlumb defaults & type registration** — `filterDefaultTypes`, `registerConnectionTypes`, the small set of constants the renderer reads at boot.
- **Connection-type predicates** — `getDefaultConnectionTypeByScope`, `allConnectionMassStatusTypes`, `allConnectionJumpMassTypes`, `setConnectionMassStatusType`, `setConnectionJumpMassType`, `setUniqueConnectionType`. All of the connection-lifecycle code above goes through these.
- **Signature / endpoint helpers** — `getConnectionDataFromSignatures`, `getEndpointOverlaySignatureLocation`, `formatEndpointOverlaySignatureLabel`.
- **System & connection search** — `getSystemData(mapId, value, key)` / `getConnectionData(...)` look up an item in the current map cache; O(n) but the cache is bounded by the per-scope system limit (50 / 100 / 100).
- **Visibility filtering** — `filterMapByScopes(map, scopes)` toggles `display` on systems and connections whose scope is hidden via the contextmenu submenu. Hidden items are still in the jsPlumb instance so reveal is instant.
- **Selection state** — `setSystemSelect`, `toggleSystemsSelect`, `setSystemVisible`, `setConnectionVisible`.
- **Scope / effect / type lookups** — `getScopeInfoForConnection(scope, option)`, `getEffectInfoForSystem(effect, option)`, `getConnectionInfo(type, option)` — thin readers of `Init.connectionScopes`, `Init.classes.systemEffects`, `Init.connectionTypes`. Stage A documented those Init shapes.
- **Geometry** — `getSystemPosition(system)` (parses `left` / `top` CSS strings), `newSystemPositionBySystem(sourceSystem)` (delegates to `Layout`).
- **State markers** — `markAsChanged(element)` flips the dirty bit consulted by `getMapDataForSync`'s "minimal" mode.
- **Status / system overlays** — `setSystemRally`, `setSystemStatus`, `showSystemInfo` (which is the actual entry point that fires `pf:renderSystemModules`).

The file is intentionally pure helpers — no DOM or jsPlumb writes happen here outside the type / class manipulation calls. Anything that needs a draw cycle goes through `map.js`.

## Auxiliary modules

### `contextmenu.js`

Four menu kinds, each rendered from the `modules/contextmenu` Mustache template and animated in/out with `velocity.transition.flipXIn` / `flipXOut`:

- **Map background** — add system, select all, filter by scope (submenu: wormhole / stargate / jumpbridge / abyssal), edit / info, delete selected systems.
- **System** — add system (chained), lock, rally, set status (submenu: dynamic per `Init.systemStatus`), find route, select connections, set waypoints (submenu: set destination / add to start / add to end), delete.
- **Connection** — toggle EOL, preserve mass, rolling, frigate-hole, mass status submenu, jump-mass submenu, change scope submenu, detach.
- **Endpoint** — toggle bubbled.

`renderMapContextMenu / renderSystemContextMenu(statusData) / renderConnectionContextMenu / renderEndpointContextMenu` each produce a hidden `<ul>` mounted to the page; `openMenu(menuConfig, e, context)` positions it under the click and reveals it. `prepareMenu` walks the `hidden / active / disabled` arrays in the per-open `menuConfig` and toggles CSS classes on `<li>` items. `selectHandler` is registered with `.one()` so the menu auto-tears-down after the first click.

Edge-flipping: submenus that would overflow the right viewport edge flip to open left; vertical overflow flips upward. The math is done at open time, not at hover, because the menu is positioned absolutely against `document.body`.

### `layout.js`

`Position.findNonOverlappingDimensions(maxResults, findChain)` is the spawn-search used when a new system is added. The algorithm:

1. Start at the centre element (the source system, or the click point if no source).
2. Spawn candidate positions on an expanding **ellipse** around the centre — first ring narrow, each subsequent ring with `gapX` / `gapY` larger.
3. For each candidate, intersect against every existing system rectangle; cache results in `dimensionCache` keyed by `'dim_<left>_<top>_<width>_<height>_<depth>'`.
4. If `mapGridClass` is enabled on the container, snap each candidate to the grid.
5. With `findChain: true`, each accepted candidate becomes the new centre for the next search — used when adding several systems in one operation.

Debug mode (URL `?debug`) renders coloured overlay divs visualising valid / invalid candidate positions.

`getEventCoordinates(e)` normalises mouse events across Firefox (`originalEvent.layerX / Y`) and Chromium (`offsetX / offsetY`). The remaining single call site of `findNonOverlappingDimensions` is the new-system add path; whether anything else reaches it is listed under [Open questions](#open-questions).

### `local.js`

The "local pilots" sidebar lives in a fixed overlay on the right edge of the map. It is bound to `pf:updateLocal` and receives a `userData` object of the form `{0: [pilotsHere], 1: [pilotsOneJump], 2: […], …}`.

- `$.fn.initLocalOverlay(mapId)` installs the overlay container, header (collapsible toggle, badge counts), and the DataTable.
- `$.fn.updateLocalTable(systemData, userData)` rebuilds the table rows: 6 columns — jump-distance badge, ship-type image, ship-type name, pilot name, station / structure icon, open-in-game-info button.
- `$.fn.clearLocalTable(mapId)` resets when the system is deselected.

The page length is **recalculated on every map resize** so the table fills the available height (default 3 rows minimum; bumps up until the viewport is full). The "you are alone" empty-state shows when `userData[0]` is empty (current system has no other pilots).

Open / closed state of the overlay is persisted per `mapId` in IndexedDB, and re-applied when `updateLocalTable` re-fires after a map switch.

### `magnetizing.js`

Thin adapter around Farahey 1.1.2 (a jsPlumb-licensed plugin). Per-`mapId` instance cache, registered/unregistered as systems are added or deleted.

- Position accessors read `system.style.left/top` directly and write via the cached element handle; this side-steps Farahey's default offset() use, which collided with jsPlumb's repaint cycle.
- Drag filter excludes locked systems (`pf-system-locked`) and elements that already carry the `jtk-drag` class (jsPlumb's own drag indicator).
- Hard position bounds: `0 ≤ left ≤ 2300`, `0 ≤ top ≤ 1400`. These are baked in; see [Known issues](#known-issues--quirks).
- 3 px padding between systems; grid-constrain callback (20 px) is enabled if `mapGridClass` is on the container.
- On every settled move, `MapUtil.markAsChanged(system)` flips the dirty bit so the next heartbeat uploads the new position.

### `scrollbar.js`

Wraps `mCustomScrollbar` to provide pan / zoom inside the map area:
- Both X and Y axes with momentum scroll; `mouseWheel` and `keyboard` plugins disabled because they conflict with `app/key` shortcuts.
- `theme: 'light-3'` to match the pathfinder palette.
- `initScrollbar(scrollWrapper, customConfig)` is the constructor.
- `scrollToPosition` / `scrollToCenter(scrollArea, element)` are used by "jump to system" interactions (route module, dotlan integration). `scrollToCenter` short-circuits when the element is already 100 % visible (`isInView()`).
- `autoScroll(scrollWrapper, position, options)` applies directional CSS classes (`auto-scroll-top` / `-right` / `-bottom` / `-left`) used by drag-near-edge auto-pan when a system is being dragged past the viewport.
- Auto-scroll inertia is direction-dependent: scrolling bottom/right uses `totalTime − (pct·totalTime)`, top/left uses just `pct·totalTime`. The asymmetry is intentional — bottom/right edges accelerate towards the unseen area, top/left decelerate.

### `overlay/overlay.js` and `overlay/util.js`

The overlay layer produces all the per-connection and map-level decorations that aren't part of the connector line itself.

Per-connection overlays:
- **Signature endpoint labels** — see [Connection lifecycle](#k162-and-signature-driven-endpoint-labels).
- **Directional arrow** — added to wormhole connections; direction derived from K162 detection (see `overlay.js:154-178`).
- **WH timer** — the "created / updated" timestamp, rendered at location 0.35 along the connector.
- **EOL timer** — remaining lifetime, rendered at location 0.25, when the `wh_eol` type is present.

Map-level overlays:
- **Info-icon panel** — a configurable strip of map-state indicators (locked, EOL highlighted, signature highlight, etc.). Each icon declares a trigger: `active` (always on while enabled), `hover` (shows on `hoverIntent`), or `refresh` (refresh button). Click handlers can fire filter clear actions.
- **Map update counter** — a small pie chart that animates over the heartbeat window (configured by `Init.performanceLogging.keyClientMapData`). Throttled to 5 of every 10 ticks to keep paint cost down. While this overlay is in its active window, `MapOverlayUtil.isMapCounterOverlayActive()` returns true and `updateMap` short-circuits to avoid mid-tick re-snap.
- **Zoom controls** — buttons that drive jsPlumb's zoom; level persisted to IndexedDB on each change.
- **Debug overlays** — connection and endpoint inspectors gated by `?debug` in the URL. Useful when tracing why an arrow rendered the wrong way or a label sits off-anchor.

`overlay/util.js` is the lookup layer: `getMapOverlay(element, overlayType)` finds the overlay container for a given type, `getMapElementFromOverlay(overlay)` walks back up, `getMapCounter(element)` returns the pie node, `isMapCounterOverlayActive(element)` is the guard used in the update pipeline. The file also exports the canonical `config` block — every overlay ID, every CSS class name, the `logTimerCount: 3` (seconds) duration of the counter pie, and the arrow-success / arrow-danger class names used by the directional overlay.

## Realtime update integration

There are two ingress paths into `map.js`, both ultimately feeding `updateMap` / `updateUserData`:

```
AJAX heartbeat                               WebSocket (via SharedWorker, Stage F)
─ Util.request('updateData')                 ─ MapWorker → port.onmessage(ws:send)
   └─ Util.setCurrentMapData(response)         └─ message.data.task ∈ {
       └─ ModuleMap.updateMapModule              'mapUpdate', 'mapAccess',
           └─ Map.updateMap(area, mapData)       'systemUpdate', 'connectionUpdate',
                                                 'userUpdate', …
                                              }
                                              └─ dispatch into ModuleMap / Map updaters
```

Per-task dispatch lives in `mappage.js` (Stage F) and routes:
- `userUpdate` payloads → `Map.updateUserData(mapElement, userData)` → updates the body of each system tile + fires `pf:updateLocal` for the sidebar.
- `mapUpdate` / `systemUpdate` / `connectionUpdate` payloads → `Map.updateMap(...)` with a minimal diff so individual system / connection updates don't trigger a full re-draw.
- `mapAccess` payloads (share/unshare events) flow through `ModuleMap.updateMapModule` to rebuild the tab bar.

### In-flight overlap (answer to Stage F open question)

There is **no per-key in-flight guard** on `Util.request()`. Two mitigations exist:
1. `MapOverlayUtil.isMapCounterOverlayActive()` is the gate that `updateMap` checks; during the counter-pie animation window, incoming updates are skipped (the next heartbeat will pull a fresh snapshot anyway).
2. `setSuspendDrawing(true)` is wrapped around every batch so a WebSocket update arriving mid-AJAX-handler does not produce two paint cycles.

When a WebSocket update lands between an AJAX request being sent and its response arriving, the AJAX response may overwrite the WebSocket-applied state. The server's merge logic mostly absorbs this (it uses `updated` timestamps), but a brief flicker is possible — this is the source of the "WS update may be overwritten by next AJAX cycle" caveat in Stage F.

## Map data shape (client side)

The renderer's view of `currentMapData`:

```jsonc
{
  "config": {
    "id": 42,
    "name": "My Wormhole Chain",
    "scope": "wh",                  // default scope for new connections
    "type": "private",              // private | corp | alliance
    "icon": "fa-globe",
    "deleted": 0,
    "created": 1700000000,
    "updated": 1700001234,
    "logging": { … }
  },
  "data": {
    "systems": [
      {
        "id": 1001,                 // pathfinder system row id
        "systemId": 30000142,       // EVE SDE solar system id
        "name": "Jita",
        "alias": "Tradehub",
        "security": "0.9",
        "trueSec": 0.94,
        "region": { "id": 10000002, "name": "The Forge" },
        "constellation": { "id": 20000020, "name": "Kimotoro" },
        "effect": null,             // 'magnetar' | 'pulsar' | 'cataclysmic_variable' | …
        "statics": ["C247"],
        "drifter": false,
        "shattered": false,
        "locked": 0,
        "rallyUpdated": 0,
        "position": { "x": 240, "y": 180 },
        "type": 1,                  // 1=k-space, 2=c-space, 3=abyssal
        "status": { "id": 2, "name": "Friendly" },
        "updated": 1700001234
      }
      // …
    ],
    "connections": [
      {
        "id": 5001,
        "source": 1001,             // system row id (not EVE id)
        "target": 1002,
        "scope": "wh",
        "type": ["wh", "wh_fresh", "wh_eol", "wh_jump_mass_m"],
        "signatures": [
          { "id": 9001, "source": 1, "name": "ABC-123", "type": "K162" },
          { "id": 9002, "source": 2, "name": "DEF-456", "type": "C247" }
        ],
        "updated": 1700001234,
        "eolUpdated": 1700000800
      }
    ]
  }
}
```

Field-level provenance and storage live in [02-data-model.md](02-data-model.md); endpoint URLs that emit or accept this shape live in [03-backend-api.md](03-backend-api.md).

## Known issues / quirks

- **Hard magnetizer viewport bounds** (`magnetizing.js`, `0..2300 × 0..1400`) suggest the original product was sized for a single screen and never made configurable. Systems dragged outside collapse back into-range silently.
- **jsPlumb 2.9.3 → 2.13.1 arrow-overlay regression** — a TODO in `overlay.js:127-139` notes that the directional arrow's `<canvas>` has to be manually re-appended after type changes; the original jsPlumb path stopped doing this in 2.13.
- **`connection._jsPlumb` undefined race** (`map.js:2310`, `util.js:458-521`) — concurrent server-driven removal can null out the internal handle while a click handler is still in flight. Every consumer guards with `if (connection._jsPlumb)`.
- **K162 arrow flip logic** (`overlay.js:154-178`) is a non-obvious branch — anyone touching the arrow overlay should add a comment with their assumptions, because the K162 / target / source rules are easy to get backwards.
- **DataTable page-length recompute on every map resize** (`local.js:356-396`) — the recompute walks every row to measure. Bearable for the realistic pilot counts on a single system but a Stage J rebuild should switch to virtual scrolling.
- **`Array.prototype.diff` and `String.prototype.capitalize`** are assumed available, polyfilled in `app/lib/prototypes.js`. A rebuild that lazy-loads will have to either replicate those polyfills or refactor call sites.
- **WS update may be overwritten by next AJAX cycle.** Server merge usually absorbs it; ordering is not guaranteed.
- **`MapOverlayUtil.isMapCounterOverlayActive()` is a paint-time guard, not a transactional one.** A WS update arriving during the counter window is *dropped on the client*; the next AJAX cycle re-fetches. If the next AJAX cycle is also delayed, the user sees stale data for up to one heartbeat window.
- **Hard-coded mapId-keyed singletons** (jsPlumb instance, magnetizer instance) leak if the same map is loaded twice in different DOM containers (currently impossible because tabs are exclusive, but worth noting for the rebuild).
- **Mass-status mutual exclusion enforced only client-side** via `setUniqueConnectionType`. If two clients toggle conflicting mass statuses at the same instant, the server accepts both and one wins by `updated` timestamp.
- **`renderModules` velocity animation cost.** Switching tabs runs a velocity transition per module; on lower-end machines the first paint after a tab change can lag visibly.
- **Tab-order IndexedDB key collisions** if a character is added to a map with the same numeric ID as a previously-deleted map (rare but documented in the issue tracker).
- **The directional arrow uses `'connectionArrowOverlaySuccessClass'` / `'…DangerClass'`** for colour, but the success / danger semantics are inverted on `wh_critical` mass — the arrow goes red because the **wormhole** is dangerous, not because the route is. Confusing but historical.

## Open questions

- `Map.getMapDataForSync(mapContainer, filter, minimal)` "minimal" mode: what subset of fields are omitted vs full payload? The server `Api/Map::updateData` clearly accepts both shapes — confirm field-by-field against the controller in [03-backend-api.md](03-backend-api.md).
- `Position.findNonOverlappingDimensions` has only one identified call site (new-system add). Is `findChain: true` actually exercised anywhere, or is it dead code from an older "import chain from D-scan" feature?
- `?debug` overlay inventory — there is a debug overlay system in `overlay.js:709-804`, but no public documentation of which keystrokes / clicks toggle each debug view.
- The pie-chart "update counter" is keyed by `Init.performanceLogging.keyClientMapData` — confirm the exact value of that key and how it correlates with the Stage D cron `UPDATE_CLIENT_MAP.EXECUTION_LIMIT=100`.
- `Magnetizer.executeAtEvent` is called on every drag tick — is the per-event recomputation actually cheap, or is there an underlying frame budget being missed on large maps (50+ systems)? Worth a profile pass during rebuild.
- The `state_active` type applied on selection is removed by `pf:removeSystemModules` — verify what happens if the user navigates away from the tab without deselecting (i.e. is the type persisted into the next save cycle? `filterDefaultTypes` should strip it, but confirm the strip happens on every send path, including the WebSocket-fed `markAsChanged` path).

## Self-check (per Stage G checklist)

- [x] Every file in this stage's "Critical files" list read: `js/app/map/map.js`, `system.js`, `util.js`, `contextmenu.js`, `layout.js`, `local.js`, `magnetizing.js`, `scrollbar.js`, `overlay/overlay.js`, `overlay/util.js`, `js/app/module_map.js`. `js/app/map/worker.js` is the SharedWorker façade and was deliberately deferred — fully covered in [06-frontend-architecture.md](06-frontend-architecture.md#sharedworker--websocket-transport).
- [x] Every public entry point in scope covered: `ModuleMap.updateMapModule / updateMapUserData / updateSystemModulesData / getMapModuleDataForUpdate`; `Map.getMapInstance / loadMap / updateMap / updateUserData / getMapDataForSync / drawSystem / drawConnection / saveConnection / saveSystemCallback`; `System.showNewSystemDialog / showRallyPointDialog / showDeleteSystemDialog / removeSystems / getHeadInfoElement`; auxiliary modules' exports inventoried in [Auxiliary modules](#auxiliary-modules).
- [x] Open questions listed above, not silently dropped.
- [x] Feature matrix updates — `10-feature-matrix.md` rows pointing "→ G" are now answered by this document; new auxiliary rows (overlay system, custom scrollbar, drag-select marquee) will be added inline alongside the next opportunistic edit, or batched into Stage I.
