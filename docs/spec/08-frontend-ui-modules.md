# 08 — Frontend UI Modules & Dialogs

**Stage H output.** Documents everything that surrounds the map canvas: the docked "info modules" in `js/app/ui/module/` (system info, signatures, intel, killboard, route, graph, Thera, connection info, tags, dotlan, plus the abstract base and the empty/demo skeletons), the bootbox-driven dialogs in `js/app/ui/dialog/` (account settings, map info, map settings, stats, jump info, system effects, changelog, manual, shortcuts, credit, delete account, API status, notification), the shared form widgets in `js/app/ui/form_element.js`, the login-page canvas in `js/app/ui/layout/header_login.js`, and the corresponding server-rendered templates under `public/templates/`.

Map canvas internals (jsPlumb, drag, magnetize, overlays, contextmenus rendered on the canvas) are Stage G ([07-frontend-map-engine.md](07-frontend-map-engine.md)). The page chrome, RequireJS bootstrap, key shortcut table, and SharedWorker/WebSocket transport are Stage F ([06-frontend-architecture.md](06-frontend-architecture.md)). API endpoints listed under "Server calls" below are documented end-to-end in [03-backend-api.md](03-backend-api.md). Persistence schemas referenced by edits (signature, connection, character, map) are in [02-data-model.md](02-data-model.md).

## Module / dialog inventory

### Info modules (`js/app/ui/module/`)

| File | LOC | Scope | Purpose |
|---|---|---|---|
| `base.js` | 513 | — | Abstract parent. Lifecycle dispatcher, cache singletons, request helper, header/toolbar builders, IndexedDB scoped store. |
| `system_info.js` | 693 | system | System metadata: name, alias, type, region/constellation, security, effect, sovereignty, faction warfare, description (Summernote). |
| `system_signature.js` | 3,240 | system | Signature table — three DataTables (primary, secondary "add row", info preview), xEditable inline cells, in-game-paste parser, undo history, connection linker, scan-progress %. The single largest module in the app. |
| `system_intel.js` | 1,367 | system | Structures (citadels, NPC stations) — owner, status icon, standings, services, tag/notes edit. Separate K-space station table for H/L/0.0/T/C12. |
| `system_killboard.js` | 854 | system | zKillboard feed — recent kills/losses with WebSocket live push, region + system filters. Uses Fetch not jQuery. |
| `system_route.js` | 1,266 | system | Route finder — DataTable of hops with security/wormhole class, "find route" dialog with system autocomplete, "prefer safer" toggle. |
| `system_graph.js` | 392 | system | Morris charts of jumps / NPC kills / ship kills / pod kills (K-space only). |
| `global_thera.js` | 1,043 | global | Thera connections — eveScout sync, quick-map button, status icons (mapped / not in eveScout / out of sync). |
| `connection_info.js` | 1,286 | connection | Mass logs per connection — per-jump rows with character, ship class, mass-before/after, reduced/critical thresholds; signature linker. |
| `tags.js` | 146 | system | Bookmark "next tag" grid — rows per index, columns C1–C6 — read-only view of map `nextBookmarks` config. |
| `demo.js` | 310 | system | Developer toolkit — live lifecycle inspector with handler counter, JSON dumps of module config / current user / current map. |
| `dotlan.js` | 103 | system | Dotlan.net regional map iframe (K-space only). |
| `empty.js` | 70 | system | Bare skeleton kept as a template for plugin authors. |

### Dialogs (`js/app/ui/dialog/`)

| File | LOC | Template | Purpose |
|---|---|---|---|
| `account_settings.js` | 208 | `dialog/settings.html` | Three-tab account/share/character settings; captcha-gated saves. |
| `api_status.js` | 75 | `dialog/api_status.html` | Read-only ESI endpoint health board. |
| `changelog.js` | 138 | (generated) | GitHub releases timeline with version-delta status. |
| `credit.js` | 37 | `dialog/credit.html` | Static credits, donation links, version. |
| `delete_account.js` | 129 | `dialog/delete_account.html` | Account deletion with captcha + redirect on success. |
| `jump_info.js` | 224 | `dialog/jump_info.html` | Wormhole reference: mass table (paginated DataTable) plus two statics matrices plus jump compatibility. |
| `manual.js` | 167 | `dialog/map_manual.html` | Multi-section user guide with custom-scrollbar scrollspy. |
| `map_info.js` | 1,401 | `dialog/map_info.html` | Four-tab map snapshot — Summary, Systems, Connections, Users, plus optional Logs tab. |
| `map_settings.js` | 773 | `dialog/map.html` + `form/map.html` | New / edit / settings / import-export. Slack + Discord webhooks live here. |
| `notification.js` | 85 | `dialog/notification.html` | Full-screen blocking alert with animated headline; used for server-shutdown class messages. |
| `shortcuts.js` | 48 | `dialog/shortcuts.html` | Read-only render of `Key.getGroupedShortcuts()`. |
| `stats.js` | 870 | `dialog/stats.html` | Private/Corp/Alliance activity stats with Peity sparklines, period navigation. |
| `system_effects.js` | 193 | (generated) | One DataTable per W-space anomaly effect, cross-table column hover. |

### Shared widgets and chrome

| File | LOC | Role |
|---|---|---|
| `js/app/ui/form_element.js` | 916 | jQuery plugins: `initMapSelect`, `initSystemSelect` (AJAX), `initConnectionSizeSelect`, `initStatusSelect`. Select2 result/selection formatters for signature-type and connection-type displays. |
| `js/app/ui/layout/header_login.js` | 586 | Animated starfield canvas on the login splash. Particle physics, pointer-follow brightening, IntersectionObserver pause when tab hidden. |

The map-page chrome (`page.js` header bar, character switcher popover, tracking toggle) and the docking grid (`module_map.js`) are documented in Stage G [§ tab shell](07-frontend-map-engine.md#module_mapjs--tab-shell-and-module-grid); this stage only documents what lives **inside** the module/dialog DOM each renders.

## The module lifecycle (`base.js`)

Every info module extends `BaseModule` (CommonJS class exported by `base.js`). The class is intentionally abstract — instantiating it directly throws — and enforces the contract by which `module_map.js` mounts modules into the dock grid.

### Static metadata

Each subclass declares (as static fields) what tells the dock how to handle it:

| Static field | Purpose |
|---|---|
| `scope` | `'system'`, `'connection'`, `'global'`, `'plugin'`, or `undefined`. Picked by `module_map.js` when iterating which modules to mount for a given trigger (system clicked / connection clicked / always-on). |
| `sortArea` | `'a'`, `'b'`, or `'c'` — initial grid column. User drag-drop persists a per-map override in `Util.getLocalStore('map').{mapId}.modules_area_{area}`. |
| `position` | Default ordinal within the sort area. |
| `label` | Header label rendered in `newHeaderElement()`. |
| `isPlugin` | When true, the module is treated as user-supplied and isolated from core update events. |
| `fullDataUpdate` | When true, `update()` is called on every map data refresh, not only on scope-change. Used by `demo.js`. |

### Handler enum

`BaseModule.Handlers` (line ~482) declares the lifecycle slots:

| Handler | When called | Notes |
|---|---|---|
| `render` | Once when the module is mounted | Required; subclasses that omit it throw. Returns the root `<div>` element. |
| `init` | After the DOM is in the page | Used to bind DataTables, Morris graphs, FormElements — anything that requires the element to be measurable. |
| `update` | Whenever the dock pushes new data (system click, signature event, ship change) | Receives an opaque `payload` and a "task" string distinguishing intents (see `system_route.js`). |
| `beforeHide` | About to be hidden by collapse / tab switch | Pause subscriptions; persist scroll. |
| `beforeDestroy` | About to be removed | Destroy DataTables / FormElement Select2 instances, drop event handlers. |
| `onSortableEvent` | Sortable.js drag start/end | `demo.js` uses this; most modules don't. |

`handle(name, ...)` is the dispatcher — it logs through `logHandler()` (which `demo.js` overrides to drive its live status list) and serialises calls through a `PromiseQueue` so an in-flight `update()` cannot race a `beforeDestroy()`.

### Shared services

- `request(action, method, payload, context)` — wraps `Util.request()` so subclasses don't repeat the `Init.path.api + '/' + action` boilerplate.
- `getLocalStore(scope)` — returns the `Util.getLocalStore()` instance scoped to `'character'` / `'module'` / `'settings'`. Used for filter state, dismissed warnings, last-selected tab.
- `getCache(name)` — static singleton `Map`-backed caches with TTL/maxsize. The two used in practice are `mapConnections` (TTL 5 s, max 600 entries) and the per-module connection-data cache. Cache keys are hashes of sorted system pairs (`getConnectionDataCacheKey()`).
- `showNotify(opts)` — passthrough to `Util.showNotify()` so feedback popovers come from the module itself, not a child element.
- Element builders: `newHeaderElement()`, `newToolbarElement()`, `newLabelElement()`, `newIconElement()`, `newControlElement()` — produce the standard chrome so a module's body only has to render its own content.

### Update queueing

`module_map.js` does not call `update()` directly; it enqueues an update task. The queue:

- Serialises module updates so a rapid sequence of map refreshes does not produce overlapping renders.
- Discards stale tasks if the module is destroyed before they fire.
- Is paused while a Sortable drag is active (`_sortableChoosePromise`) and resumed in `onSortableEvent('end')`.
- `demo.js` exposes a play/pause toggle that returns its own `DeferredPromise` to manually hold the queue.

The dock grid itself — three areas `a`/`b`/`c`, drag-handle on the module header, collapse-on-corner-click, per-map persistence — is detailed in Stage G [§ module dock](07-frontend-map-engine.md#module_mapjs--tab-shell-and-module-grid). The contract from the module's side is just: implement the lifecycle, declare the statics, accept the queue's serialisation.

## Per-module specs

### `system_info.js`

**Purpose.** Header tile + body section for the currently-selected system: alias, type, region/constellation breadcrumb, security badge, status, effect badge, sovereignty (faction / corp / alliance with portrait), faction-warfare occupier, and a Summernote-edited description.

**Surface area.** Template `public/templates/modules/system_info.html` rendered with Mustache. Custom `newHeaderElement()` overrides the base header to produce a breadcrumb-style row (alias → type → region → constellation → system) with a copy-deeplink icon. Description block embeds a Summernote instance constrained by `summernote.loader.js`.

**Inputs.** System data object as published by `Util.getCurrentMapData()` (fields enumerated in [02 § SystemModel](02-data-model.md)). Configurable third-party links (`dotlan`, `eveeye`, `anoik`) read from `Init.url`. Triglivian flag toggles the `pf-font-triglivian` CSS class for Abyss system names.

**Outputs / server calls.** Description edits POST to `Init.path.api + '/System'` with `{id, description}`; success path silently updates `Util.getCurrentMapData()` in place. Alias edits flow through `System` as well.

**Side effects.** `pf-resizebar` handles let users drag the inner table heights; the resulting heights are persisted to IndexedDB under the system's pf-id.

**Dependencies.** Summernote (with custom `lengthField` and `discardBtn` plugins), Mustache, `form_element.js` (system status icons), Util image roots.

**Quirks.** Locked systems render a padlock icon in the header (`isLocked`). Shattered K-space systems get a distinct icon (`pf-font-shattered`). Drifter holes render the C14–C18 badges via the same path as regular C1–C6.

### `system_signature.js`

**Purpose.** The single biggest piece of UI in the app. Manages the per-system signature list: add / edit / delete sigs, parse in-game probe-scanner output, link sigs to wormhole connections, undo to any historical snapshot, and surface a scan-progress percentage in the module header.

**Surface area.** Three DataTables built imperatively in JS (no template):

| Table | Purpose | Notable plugins |
|---|---|---|
| primary | All signatures on this system | xEditable cells, Responsive plugin (mobile column-hide), TableTools (copy/csv) |
| secondary | A single empty row used for fast "type and tab" entry | Auto-promoted to primary row on save |
| info | Read-only preview shown inside dialogs (delete confirm, undo preview) | None |

Columns on the primary table: select-checkbox, signature ID, age (relative time), type (wormhole class label + size kbd badge), connection (FormElement select), status (editable), notes, action. xEditable validators split a freeform "C3 - Dangerous" type input into wormhole class + security via regex.

**Inputs.** `update()` accepts:
- New / changed signature data pushed via `pf:updateSystemModules` events from the map.
- Paste events on the secondary table — the parser matches in-game scanner output (`<id> <group> <name> <%> <distance>`) and pre-fills cells.
- Ship change events (`pf:activeShip`) — recalculate mass column.

**Outputs / server calls.**

| Endpoint | Method | Use |
|---|---|---|
| `Signature` | POST | Add new signature(s) |
| `Signature` | PUT | Update existing signature cell |
| `Signature` | DELETE | Delete signature(s) |
| `SignatureHistory` | GET / POST | List undo points; restore a snapshot |
| `Connection` | POST | Create wormhole connection when a sig is linked to a new sister-sig on another system |
| `Connection` | PUT | Update existing connection when sig linkage changes |

**Side effects.** Fires `pf:calcInfoTable` after every change so `connection_info.js` recomputes mass aggregates. Updates the module header's progress ring (signatures with a non-blank type ÷ total).

**Dependencies.** DataTables + Responsive plugin + TableTools, xEditable, `form_element.js` connection/status selects, bootbox confirm.

**Quirks.**
- The Responsive plugin requires a visible measurement; the module triggers a fake resize after init to force layout when the table starts hidden.
- `keyNavigation()` is a custom Tab/Enter/Esc handler — the default xEditable handlers were too slow for "scan, paste, tab, tab, tab" workflows.
- The undo history is a popover, not a dialog; it polls `SignatureHistory` on focus to avoid stale snapshots.
- Group-filter chips are persisted per character (not per map) under `character.{id}.filterSignatureGroups` so a user's preferred filter survives switching maps.
- Each signature row caches the rendered wormhole-size kbd badge to avoid re-running the regex on every redraw — invalidated on the row's `pfChanged` marker.

### `system_intel.js`

**Purpose.** Structures + stations sidebar. Lists citadels, refineries, and (in K-space) NPC stations of the current system, with status icon, owner, standings, services, notes/tags.

**Surface area.** Two DataTables — structure table + station table — both initialised in `init()`. The station table is only mounted for security classes `H`, `L`, `0.0`, `T`, `C12` (Pochven / Triglavian).

**Inputs.** `update()` payload may include `{type: 'init'|'stations'|'structures', data}`. Triggered on system change and on the inline edit save callbacks.

**Outputs / server calls.**

| Endpoint | Method | Use |
|---|---|---|
| `SystemIntel/{systemId}` | GET | Fetch structures + standings |
| `SystemIntel/{systemId}/{structureId}` | PUT | Update notes/tags on a single structure |

**Side effects.** Tooltips re-initialised on every draw complete. Filter chips persist per character.

**Dependencies.** DataTables, xEditable, FormElement for the type-of-structure select.

**Quirks.**
- A `romanToInt()` helper translates "Rig VII" into a sortable integer column.
- Info-window icons emit a clipboard-formatted `<url=showinfo:typeID//itemID>` string for paste-into-EVE.
- Standings colouring is computed client-side from the user's contact data, so the cell colour can lag a contact-import cycle.

### `system_killboard.js`

**Purpose.** Recent kills + losses for the current system (or the broader region, toggleable). The only module that uses Fetch directly instead of `Util.request()` — zKillboard expects a different error envelope.

**Surface area.** DataTable of kills; toolbar with filter chips (toggle inclusion of own corp / alliance), system + region zKillboard deep-links, WebSocket status pip (`_iconWsEl`, h5 with a colour class). Live kill notifications stream from the zKillboard WebSocket and prepend rows.

**Inputs.** System ID; user contacts (for own corp/alliance filter). WebSocket messages.

**Outputs / server calls.** None on the Pathfinder backend. Two external endpoints:
- `https://zkillboard.com/api/...` REST for the initial table population.
- The zKillboard WebSocket for live kills.

**Side effects.** Maintains an open WebSocket across the lifetime of the module.

**Quirks.** WebSocket reconnect is bounded; after N failed retries the module gives up and surfaces a red pip. zKillboard's rate-limit headers are honoured — exceeding them shows a warning toast and pauses fetches.

### `system_route.js`

**Purpose.** Pathfind between the current system and any other system reachable on the loaded maps; render the hop list with security/wormhole class.

**Surface area.** Flat DataTable (no pagination), header toolbar with "find route" button that opens a small inline dialog. The dialog uses `form_element.js#initSystemSelect` for the autocomplete.

**Inputs.** `update()` is task-discriminated:

| Task | Effect |
|---|---|
| `showFindRouteDialog` | Open the inline dialog |
| `findRoute` | Submit the dialog form |

`_systemFromData` (the source system) is captured at render and is immutable for the module's lifetime; user picks the destination.

**Outputs / server calls.** POST `Route` with `{systemFrom, systemTo, mapIds[], stargates, jumpbridges, wormholes, prefer}`. Response is an ordered array of hops; the table replaces its rows on each response.

**Side effects.** None outside the module.

**Quirks.** "Prefer safer" applies on the server (the Route controller weights edges); the toggle is just a checkbox on the request. Connection data is read from `BaseModule.getConnectionsDataFromMaps()` cache to avoid duplicate fetches per system change.

### `system_graph.js`

**Purpose.** Multiple Morris.js charts side-by-side: jumps, ship kills, NPC kills, pod kills, by day, K-space only.

**Surface area.** A grid div with one `.pf-graph` per series. Custom toolbar with a popover-anchored help icon.

**Inputs.** System ID; chart configuration from `Init.systemGraphs` (which charts to draw, time window, axis units).

**Outputs / server calls.** GET `SystemGraph/{systemIds}`. The request is fired inside `render()` and the promise is stored on the instance as `_dataPromise`; Morris instantiation is deferred to `init()` so that DOM measurement is correct (Morris breaks on hidden containers).

**Quirks.** Skipped entirely for non-K-space — `render()` returns an empty body and `init()` is a no-op for J-space, sov-null, Pochven, etc., depending on the configured graph keys.

### `global_thera.js` (the Thera module)

**Purpose.** Global module (scope = `global`) that lists eveScout-published Thera connections, lets the user sync them into the active map, and flags drift between the two sources.

**Surface area.** DataTable: destination system, class, security, status, sync checkbox, quick-add button. Status icons distinguish: present in eveScout and on map (green), present in eveScout but missing on map (warning), present on map but no longer in eveScout (hint).

**Inputs.** Periodic polling (configured interval); user-triggered "sync" button.

**Outputs / server calls.**

| Endpoint | Method | Use |
|---|---|---|
| `Thera` | GET | Pull current eveScout snapshot |
| `Thera` | POST/PUT | Trigger server-side sync of eveScout → map |
| `Connection` | POST | Add an individual eveScout connection to the active map |

**Side effects.** Adds connections to the active map's data store; firing the same `pf:updateSystemModules` cascade that signatures use.

**Quirks.** The eveScout source URL is config-driven so the module can be repointed if eveScout itself moves. The "not in connections" status text is intentionally a warning, not an error — a Thera sig that disappeared from eveScout may simply have collapsed.

### `connection_info.js`

**Purpose.** One panel per open connection, listing mass-jump logs (who jumped, what ship, mass before / after, resulting stability bucket — fresh / reduced / critical) plus the connection's linked signatures.

**Surface area.** A pool of connection panels with a custom `newHeaderElement()` that shows source ↔ target. Each panel hosts a mass-log table and a signature-linkage strip. Headers carry "use current ship mass" toggles.

**Inputs.** Two events:
- `pf:updateConnectionInfoModule` with `{connectionId, connectionsUpdate, connectionsRemove}` — the standard add/update/remove triple.
- `pf:activeShip` — recompute mass column with the user's current ship.

**Outputs / server calls.** GET `Connection/{connectionIds}` with `addData: ['signatures', 'logs']`. Mass logs are mutated via the same endpoint when the user manually records a jump.

**Side effects.** Fires `pf:calcInfoTable` after row changes so the signature module re-renders.

**Quirks.**
- Panels are pooled, not destroyed, when a connection scrolls out of focus — opening it again reuses the DOM. This keeps DataTable redraws cheap.
- `enrichConnectionsData()` merges the signature data response with the log data response into a single per-connection object before the panel renders, so the panel renderer has no awareness of which fields came from which endpoint.

### `tags.js`

**Purpose.** A read-only grid showing the bookmark "next number" per wormhole class — i.e., the next free bookmark tag the user should pick for a C1 hole, C2 hole, etc. Mirrors the map's `nextBookmarks` config.

**Surface area.** A plain HTML table built imperatively (no DataTable). Six columns, one per class.

**Quirks.** Listed as scope = `system` even though the underlying data is map-level — the choice is so the module is only visible while the user is "in" a system.

### `demo.js`

**Purpose.** Developer-only inspector. Renders four collapsible code sections (info / config, trigger events, current-user data, current-map data, Sortable events) with live JSON output, plus a handler-call counter and a play/pause toggle that pauses the update queue.

**Quirks.** Overrides `logHandler()` to push into a UI list; this is the contract base.js documents but no other module exercises. `fullDataUpdate: true` makes it fire on every map data refresh, not just scope-change — useful for debugging churn.

### `dotlan.js`

Embeds `https://evemaps.dotlan.net/.../<region>` in an `<iframe>` for K-space only. J-space (regex `^j[0-9]{6}$`) returns nothing. Display is delayed by 1 s after init to avoid showing a flash of unloaded iframe.

### `empty.js`

Bare skeleton kept for plugin authors. Renders an empty `<div>`, implements every lifecycle hook as a no-op.

## Per-dialog specs

All dialogs are bootbox-wrapped Bootstrap modals. The opening surface is consistent: `Util.showDialog({…})` builds a config, bootbox renders, the template (`public/templates/dialog/<name>.html`) is rendered with Mustache into the modal body. The patterns below avoid repeating that.

### `account_settings.js`

Trigger: `ShowSettingsDialog` shortcut, menu link. Template `dialog/settings.html`. Three tabs: Account, Share, Character.

- **Account tab.** Username (collapse-on-blur edit), password, email, language, theme, captcha. CAPTCHA refresh helper is `showCaptchaImage()` and is also reused by `delete_account.js`.
- **Share tab.** Corp / alliance map-sharing rights — toggles read into `Init.currentUserData.share`.
- **Character tab.** Auto-pick-on-login selector, role display.

POST `Init.path.saveUserConfig`. On success calls `Util.setCurrentUserData()` and regenerates the captcha; on 400 displays inline form errors. The dialog short-circuits if another dialog is already open.

### `api_status.js`

Trigger: click on the API-status pip in the sticky server panel (also opened from login). Template `dialog/api_status.html`. Pure read of `apiData` passed in by the caller; renders one row per ESI endpoint with method colour and a status badge (green / yellow / orange / red). No server call inside the dialog.

### `changelog.js`

Trigger: navbar "version" link. No HTML template — the timeline is built from `templates/ui/timeline_element.html` repeatedly. POST `Init.path.gitHubReleases` returns `{version: {current, last, dev, delta}, releasesData}`. Each release is appended with a Velocity-staggered expand animation; the version comparison drives the panel colour (success / warning / info / error).

### `credit.js`

Static-content dialog. Template `dialog/credit.html` with version + Patreon / PayPal links. No server call.

### `delete_account.js`

Trigger: `DeleteAccount` shortcut. Template `dialog/delete_account.html`. Captcha-gated; POST `Init.path.deleteAccount`. On success the response carries `{reroute}` and the dialog calls `Util.redirect()`; on failure displays a form message and refreshes the captcha. Confirmation button is yellow rather than red to reduce mis-clicks on an irreversible action.

### `jump_info.js`

Trigger: `ShowJumpInfo` shortcut. Template `dialog/jump_info.html`. Three DataTables, all populated client-side from `Init.wormholes` and hard-coded matrices:

| Table | Source |
|---|---|
| Wormhole mass table | `Init.wormholes` keyed by code (J-class, mass, lifetime, sig strength) — paginated 15/25/35/50 |
| Statics (W-space and Drifter) | Two hard-coded lookup matrices by source class |
| Jump compatibility | A third hard-coded matrix |

Custom Mustache lambdas format mass / time / sig-strength columns.

### `manual.js`

Trigger: navbar "manual" link. Template `dialog/map_manual.html`. The dialog uses a sidebar of sections that double as Bootstrap tabs. Scroll inside the body drives an active-section highlighter; `mCustomScrollbar` is the scrollbar. Programmatic scrolls (clicking a sidebar link) disable the scroll-event handler so the activated section doesn't bounce. On hide, the scrollbar is destroyed.

### `map_info.js`

Trigger: `ShowMapInfo`. Template `dialog/map_info.html`. Four tabs:

| Tab | Content |
|---|---|
| Summary | Map icon, name, type, share link (copy-to-clipboard), system/connection counts, lifetime counter, creator |
| Systems | DataTable of every system on the map with delete action |
| Connections | DataTable of every connection |
| Users | Active pilots with role/corp/alliance/online status |
| Logs (conditional) | Activity history — only shown if `logHistoryEnabled` |

Each table is cached per map ID via `Util.getDataTableInstance()` so the dialog reopening on the same map is instant. The refresh button forces a re-fetch via `activeMap.getMapDataFromClient()` and redraws everything. System deletion goes through a `pf:deleteSystems` event on the map element with an ack callback (so the dialog can remove the row only after the map confirms the server delete).

### `map_settings.js`

Trigger: `ShowMapSettings` or right-click "settings" on the map background context menu. Template `dialog/map.html` plus form sub-templates `form/map.html`. Four tabs:

| Tab | Content / endpoints |
|---|---|
| **New map** | Name, icon, scope, type. Requires `map_create` right. POST `saveMapData` |
| **Edit map** | Hidden if no map selected. Requires `map_update`. POST `saveMapData` |
| **Settings** | Connection cleanup toggles (delete expired, delete EOL), persistence (aliases, signatures), Abyssal jump tracking, log history / log activity (the latter disabled if global `logActivityEnabled = false`), Slack webhook + channel + username, Discord webhook(s) + username, plus character/corp/alliance selectors for the notification audience. POST `saveMapSettings` |
| **Import / Export** | File drop zone (`pf-form-dropzone`) for import; export downloads a JSON file named with today's date built client-side |

Webhook fields are split per-purpose: a Slack URL for the "history" channel can be set independently from the "rally" channel; same for Discord. The cron-driven dispatch on the server side is in [04 § notification crons](04-cron-and-background.md).

### `notification.js`

Trigger: programmatic — `showNotificationDialog(dialogData)` from `page.js` for things like "server shutdown in N minutes". Template `dialog/notification.html`. Full-screen modal with an animated headline (Velocity shrink-in, scale-up 5×). The bootbox close-button in the top-right is removed on `shown` to force the user through the explicit buttons. Multiple simultaneous notification dialogs are prevented.

### `shortcuts.js`

Trigger: `Shortcuts`. Template `dialog/shortcuts.html`. Renders `Key.getGroupedShortcuts()` (the shortcut table itself is defined in `js/app/key.js` — see [06 § keyboard](06-frontend-architecture.md)). No server call.

### `stats.js`

Trigger: `ShowStatsDialog`. Template `dialog/stats.html`. Three tabs by scope (Private / Corp / Alliance) — each conditionally enabled by user rights, with the first enabled tab selected by default.

DataTable has 21 columns: rank (trophy icon), character portrait, name, last-login, then triplets (create / update / delete) for **map**, **system**, **connection**, **signature** actions, plus a total. Inline Peity.js mini-line-charts render the time series in each cell; the footer callback computes per-column page sums.

POST `Init.path.getStatisticsData` with `{typeId, period, week?, year?}` — response includes `{data, start: {week, year}, period, prev, next, offset}`. Prev / Next pagination buttons fire follow-up requests. Tab change re-fetches.

Quirks: 21 columns + inline sparklines + footer sums + period navigation account for the 870 LOC. The Peity instances are torn down and rebuilt on every draw; profiling history (per `git log`) indicates Peity instance leakage was a previous bug.

### `system_effects.js`

Trigger: `ShowSystemEffects`. No HTML template — every DOM node is built imperatively. One DataTable per W-space anomaly effect (e.g. "Lethargic", "Tidal"), arranged two-per-row with a `clearfix` after every pair. Rows are bonus types (anomaly cost, relic bonus, …); columns are the system classes affected (C1–C6 plus Drifter C14–C18).

Hover on a column highlights the matching column in **every** table on screen — the highlight listener is attached on `initComplete` and removed on `mouseleave` of the dialog. DataTables are torn down on `hide.bs.modal`. The dialog element is cached on the module so reopens are cheap.

## Shared form widgets (`form_element.js`)

`form_element.js` is the boundary between modules/dialogs that need a typed input and the Select2 plugin that powers most of them. It exposes four jQuery plugins on `$.fn` plus a handful of result/selection formatters.

| Plugin | Used by | Behaviour |
|---|---|---|
| `initMapSelect()` | `map_settings.js` (share / notify selectors), admin | Select2 for picking maps, capped at 5 selections. |
| `initSystemSelect()` | `system_route.js`, signature module, map dialogs | AJAX-backed system search. Renders effect icon, shattered flag, true-sec colour. `disabledOptions` filters systems already selected. Pagination supported. |
| `initConnectionSizeSelect()` | `system_signature.js`, `connection_info.js`, contextmenu | Wormhole size picker — S / M / L / XL — radio-styled. Shows the connection-shape icon as the selection. |
| `initStatusSelect()` | `system_intel.js`, contextmenu | Status picker (online / offline / anchoring), each with its FA5 icon. |

Formatters (used by Select2 `templateResult` / `templateSelection`):

- `formatCategoryTypeResultData()` — generic image+label formatter with optgroup counts.
- `formatSignatureTypeSelectionData()` — splits "C3 - Dangerous Unknown" into class + security, with a kbd badge for wormhole size.
- `formatSignatureTypeConnectionResultData()` — two-column variant showing wormhole class + security on the left and suffix labels (frigate hole, K162, etc.) on the right.
- `getSystemSecurityFromLabel()` — regex parser used by xEditable validators when the user types a freeform value.

A `pf-select2-image-lazyLoad` class is added to portraits inside Select2 results so the LazyLoad plugin (registered globally in `util.js`) only fetches images for entries the user actually scrolls to. Security class CSS is injected onto the selection element so the rest of the form picks up the class colouring without re-styling.

## Login splash starfield (`header_login.js`)

`js/app/ui/layout/header_login.js` is a self-contained particle simulation drawn on a `<canvas>` in `view/login` / the splash layout. It is not used inside the map page.

- `Color` is an RGBA tuple with a `style()` accessor.
- `Node` is a particle: position, velocity, "energy", a set of nearest siblings, a brightness factor.
- `StarCanvas` owns the canvas, the node array, the resize handler, and the render loop.

Behaviours:
- Nodes drift with a velocity-energy model; "anchors" keep clusters from drifting off-screen.
- Each node finds N nearest siblings each frame; sibling pairs draw a gradient line. The gradient interpolates each endpoint's colour, so a bright node lighting up brightens its lines too.
- The pointer position is read (and falls back to the centre when no pointer is present); nodes within radius R brighten by a falloff function. Pointer-lock API is supported for full-screen demos.
- An `IntersectionObserver` watches the canvas; when it leaves the viewport (tab hidden, page scrolled away) the render loop is paused.
- `preserveDrawingBuffer: true` — the canvas keeps the last frame across redraws so blitting full-frame is unnecessary.

Configurable: target FPS (translates into a minimum frame wait), node count, sibling count, pointer-attract radius, brightness falloff. `skipNodesMove[]` is an optimisation array — distant nodes that don't affect the visible region this frame are skipped in the position update.

## Notifications (PNotify)

The notification stack lives in `js/app/pnotify.loader.js` (Stage F dependency, but the per-module API matters here).

- **Types:** `info`, `success`, `notice` (alias for `warning`), `error`, `lock`, `unlock`. Each maps to an FA5 icon and a colour.
- **Stacks:** `bottomRight` (default toast position, 32 px margin, 5 px gap) and `barBottom` (full-width bar at the foot of the map area).
- **Desktop notifications:** Enabled via `PNotify.modules.Desktop`. Uses `public/img/notifications/logo.png` as the OS notification icon. User-gesture-gated.
- **No live server push:** notifications are not pushed over the WebSocket. The server sends data updates (map / character / signature) and the client decides whether they merit a notification. The exception is `notification.js`'s full-screen dialog, which is opened directly by a server-pushed payload.

Standard call:

```js
Util.showNotify({title, text, type}, {stack: 'barBottom', click: fn, desktop: {title, text}});
```

The `Notifications` dialog (templated by `public/templates/dialog/notification.html`) is a *separate* concept from the toast stack — it is the full-screen blocking modal used for class-of-service alerts (server going down, mandatory action required). It is not a log of past toasts.

## Context menus (briefly — see Stage G for the canvas side)

`js/app/map/contextmenu.js` + `public/templates/modules/contextmenu.html` build five menus: map background, system, connection, endpoint, plus a dynamically-generated status submenu. Stage G ([07 § contextmenu](07-frontend-map-engine.md)) covers the canvas integration (position math, hide-on-outside-click). The relevance to Stage H is which menu items invoke which dialogs / modules:

- "Settings" on the map background → `map_settings.js`.
- "Info" on the map background → `map_info.js`.
- "Find route" on a system → `system_route.js`'s find-route dialog.
- "Add signature" on a system → focuses `system_signature.js`'s secondary table.
- "Edit" on a connection → focuses `connection_info.js` (panels are scrolled into view if the connection's panel exists, created if not).

Conditional visibility goes through `prepareMenu(menuEl, hiddenOptions, activeOptions, disabledOptions)` — the option lists are derived from user rights ([09](09-permissions-and-admin.md)), map mode (locked systems hide edit), and selection state.

## Map-page header chrome

Template: `public/templates/layout/header_map.html`, behaviour: `js/app/page.js`. Detailed in [06-frontend-architecture.md](06-frontend-architecture.md), but the elements that interact with this stage:

- **Character switch popover** — built from `public/templates/tooltip/character_switch.html`. Trigger is the character portrait; opens a list of the user's other logged-in characters with quick-switch links. Cookie/tab-id parameters flow through.
- **User-location breadcrumb** — `pf-head-user-location`. Three most-recent systems, ship type image, station / structure icon when docked.
- **Active-user count badges** — three colour-coded chips (inside / outside / inactive pilots) updated by `updateHeaderActiveUserCount()`.
- **Tracking toggle** — BootstrapToggle wraps a checkbox that turns location tracking on / off. State persists to the character record server-side.
- **Map settings shortcut** — `pf-head-map` opens `map_settings.js`.

Header transitions use Velocity opacity fades.

## Setup wizard panels

The Setup controller ([03 § Setup](03-backend-api.md)) ships a one-time-use wizard at `/setup`. The panels listed under `public/templates/ui/` are its building blocks:

| Template | Purpose | Controller binding |
|---|---|---|
| `admin_panel.html` | Landing tile linking to admin SSO login | `Admin.php` |
| `character_panel.html` | Multi-account character chooser with role ribbons (Manager / Admin / "Auth pending") | rendered into the landing layout `view/index.html` |
| `server_panel.html` | Server-side configuration overview | `Setup.php` |
| `requirements_table.html` | System-requirements checklist (PHP version, extensions, ESI status) | `Setup.php` |
| `cron_table_row.html` | Single row used by `Admin.php` to list cron jobs | `Admin.php` |
| `info_panel.html`, `notice.html`, `timeline_element.html` | Generic info / notice / timeline tiles reused by Admin + Changelog | various |
| `debug.html` | Debug panel — environment, headers, session — admin-only | `Admin.php` |
| `jsonld.html` | Schema.org JSON-LD block injected into the landing page | layout |
| `map.html` | Map canvas mount point | `MapController` |

These panels are mostly Twig-rendered server-side (Stage F covers the templating engine) with light client-side enhancement (collapsible panels via Bootstrap, scroll-into-view from the admin nav).

## Templates inventory (full list)

Directory walk under `public/templates/` (65 files):

- `admin/` (5): `login`, `maps`, `members`, `notification`, `settings` — server-rendered admin sub-pages.
- `dialog/` (17): one per dialog above, plus `connection_log.html`, `dscan_reader.html`, `gallery.html`, `route.html`, `route_settings.html`, `signature_reader.html`, `structure.html`, `system.html`, `system_rally.html`, `task_manager.html` — the latter group are dialogs opened from the canvas (Stage G).
- `form/` (2): `map.html` (sub-form for new/edit), `message.html` (email composer form).
- `layout/` (4): `header_map.html`, `footer_map.html`, `footer_simple.html`, `splash.html`.
- `mail/` (2): `basic.html`, `basic_inline.html` — used by the SwiftMailer dispatch in [05 § mail](05-external-integrations.md).
- `modules/` (9): `contextmenu`, `killmail`, `lazy_image`, `notification`, `requirements_table`, `role_select_row`, `sso`, `subscriptions_table`, `sync_status`, `system_info` — reusable components inserted by Mustache fragments.
- `status/` (3): `4xx.html`, `5xx.html`, `offline.html`.
- `tooltip/` (4): `character_info`, `character_switch`, `system_popover`, `wormhole_info`.
- `ui/` (8): `admin_panel`, `character_panel`, `cron_table_row`, `debug`, `info_panel`, `jsonld`, `map`, `notice`, `server_panel`, `timeline_element`.
- `view/` (3+): `admin`, `index`, `login`, `setup` — page-level Twig parents that wrap everything else.

## Cross-cutting patterns

A few patterns repeat throughout this stage; they are noted once here rather than at each call site.

- **Event-driven, not RPC.** `pf:updateSystemModules`, `pf:updateConnectionInfoModule`, `pf:activeShip`, `pf:calcInfoTable`, `pf:changedUserData` are the public bus. Modules listen, never call each other directly. This means a feature that needs to coordinate two modules — e.g., link a sig to a connection — fires an event and lets each subscriber decide what to do.
- **PromiseQueue serialisation.** `base.js`'s `update()` runs through a queue so a slow request cannot starve a `beforeDestroy()`. Stage I should audit which modules block on long requests (`system_intel`, `system_killboard`) to confirm the queue prevents zombie updates.
- **Per-character vs. per-map storage.** Filter chips, dismissed warnings, expanded sections live in `Util.getLocalStore('character')` so they follow the user across maps. Module positions, area assignments, tab ordering live in `Util.getLocalStore('map')`. A handful of settings (theme, language) live server-side via `saveUserConfig`.
- **Lazy DataTable measurement.** Several modules and dialogs initialise a DataTable while the host element is still hidden (collapsed module, inactive tab). Initialisation pattern: render the structure, then fire a fake resize / call `responsive.recalc()` in the first visibility callback. Forgetting to do this produces a 0-width table that ignores column hiding — verified historically in `system_signature.js` and `stats.js`.
- **xEditable + bootstrap-validator combo.** Inline edits go through xEditable; full-form edits (dialogs) go through bootstrap-validator. The two share `getSystemSecurityFromLabel()` and a couple of other parsers, but otherwise have parallel pipelines.
- **Mustache for client-side templates, Twig for server-side.** Files in `public/templates/` are usually served as static assets to RequireJS via `text!`; the server pre-renders only the page shell (`view/*`) with Twig. Stage F documents the build that produces the asset paths.

## Known issues / quirks

- **DataTable instance reuse.** `Util.getDataTableInstance()` caches by table+map ID. Reopening the same dialog on the same map is instant, but invalidation on schema changes is manual — a developer who adds a column must also bust the cache. Watch for "phantom columns" in `map_info.js` after migrating data shapes.
- **Peity sparkline leaks.** `stats.js` rebuilds 21 × N Peity instances per draw. Historical commits mention a leak; the current fix tears them down in the draw callback. Heavy paging may still create GC pressure.
- **Responsive plugin + hidden mount.** `system_signature.js` triggers a synthetic resize after mount because Responsive measures column widths once. Modules in collapsed groups can ship to production with all columns visible until the user expands them, masking the bug locally.
- **Summernote across language packs.** `system_info.js`'s description editor loads the lang pack matching `Init.currentUserData.lang`; switching language without reloading the page leaves the previous pack in memory. Acceptable today since the language picker reloads.
- **WebSocket lifetime in `system_killboard.js`.** The zKB WS stays open as long as the module is mounted, including when collapsed. Stage I should confirm this is intentional vs. an oversight (the indicator pip presumes the connection is up).
- **`global_thera.js` polling.** Poll interval is configured client-side; if the server-side eveScout cache is stale, the user can churn requests without seeing changes. No exponential backoff.
- **xEditable + Tab key in signature module.** The custom `keyNavigation()` overrides default xEditable behaviour to support fast paste-and-tab workflows. Edge cases (Shift-Tab from the first cell, Escape during a validator failure) have known-acceptable quirks documented in inline comments — Stage I should enumerate them.
- **`map_settings.js` import.** Import accepts files that were exported by the same dialog. Schema versioning is not explicit — a future-format export imported into an older instance will silently drop unknown keys.
- **`notification.js` z-index.** Full-screen blocking dialogs sit above PNotify toasts intentionally, but `bootbox` confirm dialogs (e.g. delete-signature confirmation) sit below if both are open. Avoid concurrent open.
- **`changelog.js` GitHub rate limit.** GitHub API has a hard limit for unauthenticated requests; the controller in [05](05-external-integrations.md) caches but a forced refresh from a logged-out admin page can still 403.

## Open questions

- Which modules are reachable in `plugin` scope today? `BaseModule.isPlugin` exists and `empty.js` exists as a template, but no third-party plugins are wired into the build. Stage I should confirm whether plugin loading was removed or is feature-flagged.
- `system_killboard.js` uses raw Fetch instead of `Util.request()` — the comment justifies it by zKillboard's error-envelope shape. Should the rebuild standardise on Fetch everywhere or keep a dual transport?
- `tags.js`'s declared scope is `system` but its data is map-level. Was this intentional UX (only show "next tag" while in a system) or an artefact?
- `dotlan.js` is iframed; CCP / EVE Online policy on third-party embed has shifted in the past. Verify with [05](05-external-integrations.md) whether dotlan considers this allowed.
- `manual.js` content is partially hard-coded in the template and partially in JS section labels. Should a rebuild move it to a markdown source?
- `header_login.js` carries ~600 LOC of canvas physics that exists purely for visual flourish. Mark for "drop in rebuild" review.
- The `connection_log.html`, `dscan_reader.html`, `gallery.html`, `route.html`, `route_settings.html`, `signature_reader.html`, `structure.html`, `system.html`, `system_rally.html`, `task_manager.html` dialog templates live in `public/templates/dialog/` but are opened from the canvas (Stage G) — confirm none are orphans during Stage I cleanup.
- Notification dialog (`notification.js`) currently has no audit trail. Should the rebuild persist server-pushed notifications so the user can re-read them?

## Self-check

- Every file in `js/app/ui/dialog/` (13), `js/app/ui/module/` (13), plus `form_element.js` and `header_login.js` is documented above.
- Every public template under `public/templates/` is listed (full inventory in the [Templates inventory](#templates-inventory-full-list) section); dialog and module templates are linked from their respective JS specs.
- Every server endpoint named (`Signature`, `SignatureHistory`, `Connection`, `Route`, `SystemGraph`, `SystemIntel`, `Thera`, `getStatisticsData`, `saveUserConfig`, `saveMapData`, `saveMapSettings`, `deleteAccount`, `gitHubReleases`) is cross-referenced to [03-backend-api.md](03-backend-api.md).
- Open questions captured in a dedicated section rather than dropped.
- Feature matrix to be updated in Stage I: rows for signature management, route finding, killboard feed, Thera sync, structure intel, system graphs, account self-service, account deletion, map import/export, statistics dashboard, system effects reference, jump info reference, manual, changelog viewer, notification dialog, character switching, login splash.
