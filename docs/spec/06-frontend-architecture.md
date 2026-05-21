# 06 — Frontend Architecture & Build

**Stage F output.** Documents the client-side shell: how the browser bootstraps, the RequireJS/AMD module graph, the four page entrypoints (`login`, `mappage`, `setup`, `admin`), the global utility/render/key/counter/logging plumbing, the SharedWorker + WebSocket transport that pairs with the socket server in Stage D, and the Gulp build that produces versioned bundles in `public/js/v<version>/`.

Map-specific code (`js/app/map/**`, `js/app/module_map.js`, jsPlumb wiring, system / connection / overlay behaviour) is **out of scope here** — it belongs to Stage G. Dialogs and UI modules in `js/app/ui/**` are Stage H. This stage covers only the chrome around them.

Cross-references: server-side templates that hand off to the JS are described in [03-backend-api.md](03-backend-api.md); the server end of the WebSocket transport is in [04-cron-and-background.md](04-cron-and-background.md); versioning, build paths and `pathfinder.ini` settings consumed at build time are in [01-config-and-deployment.md](01-config-and-deployment.md).

## Purpose & scope

Pathfinder is a server-rendered PHP shell that delivers exactly **one HTML page per route** (`view/index.html`), then defers all interactive behaviour to RequireJS. There is no SPA router; navigation between `login → map → admin` is full page loads. Inside each page the client hydrates a `window.Init` config object via REST, then enters one of four entrypoint modules. Realtime updates (other characters moving, other clients editing the active map) arrive via a WebSocket that lives inside a `SharedWorker` so all tabs of one character share a single connection.

The build is Gulp 4 + `gulp-requirejs-optimize` (the official r.js wrapper). Production produces 7 concatenated bundles under `public/js/v<version>/app/` plus per-module standalone files for everything not pulled into a bundle, all optionally minified + gzipped + brotli-compressed alongside source maps.

## Bootstrap & page entrypoint resolution

### Server side

`public/templates/view/index.html` is the only HTML the server emits. Five `data-*` attributes on `<body>` are the entire handoff:

| Attribute | Source | Consumer | Purpose |
|---|---|---|---|
| `data-js-path` | `tplResource->getPath('script')` (`Lib\Resource`) | `js/app.js` line 8 | Per-environment base URL: `js/` in dev, `public/js/v<version>/` in prod |
| `data-script` | `tplJsView` set by controller | `js/app.js` line 4 | Which entrypoint module RequireJS loads |
| `data-character-id` | active character session | several modules | Used by the SharedWorker port subscription |
| `data-version` | `PATHFINDER.VERSION` from `pathfinder.ini` | `Util.getVersion()` | Builds the SharedWorker script URL `/public/js/<version>/app/worker/map.js` |
| `class="pf-body {{ @tplBodyClass }}"` | controller | global CSS | Page-specific styling |

`tplJsView` is set by exactly four controllers — and these are the **only** four JS entrypoints in the system:

| Controller | tplJsView | Page route |
|---|---|---|
| `Controller\AppController` (`AppController.php:34`) | `login` | `/` (and login fallback) |
| `Controller\MapController` (`MapController.php:37`) | `mappage` | `/map`, `/map/*` |
| `Controller\Setup` (`Setup.php:173`) | `setup` | `/setup` |
| `Controller\Admin` (`Admin.php:72`) | `admin` | `/admin*` |

The single `<script>` tag at line 61 loads `lib/require.js` and points its `data-main` at `js/app.js`.

### Client side

`js/app.js` (177 lines) is `requirejs.config(...)` plus a single tail line:

```js
require.config({ baseUrl: jsBaseUrl });
requirejs([mainScriptPath]);
```

So the bootstrap is:
1. `<script src=".../lib/require.js" data-main="js/app">` loads `js/app.js`.
2. `js/app.js` reads `data-js-path` + `data-script`, configures all module paths/shims, **then overrides `baseUrl`** to switch source vs. build, and finally `requirejs([data-script])` to load one of the four entrypoints.
3. The entrypoint's `define()` callback runs `initApp(document.body)`.

The two-stage `baseUrl` swap is deliberate: the `paths:` table in `js/app.js` is resolved against the *original* `baseUrl: 'js'` (so the lookup table is consistent regardless of environment), then the final loader uses `jsBaseUrl` so requests actually go to `public/js/v<version>/...` in production.

### Init config hydration

`js/app/init.js` is **not** a static config file — it exports an empty placeholder `Init` object. The real values arrive over HTTP. `mappage.js` fetches them from `Init.path.initData` (set by an earlier server-side render of `path` keys; see `Lib\Config` in [01-config-and-deployment.md](01-config-and-deployment.md)) and merges the response into `Init.*`. All four entrypoints depend on this happening before their first `Util.getCurrentMapData()` / `Util.eveImageUrl(...)` call.

Categories of values landed into `Init`:
- API paths (`Init.path.*`) — every `/api/...` endpoint URL the client talks to.
- Map render constants: icons, system effects (magnetar / red giant / pulsar / cataclysmic / wolf-rayet / black hole), wormhole sizes/classes, signature groups, frigate-hole / drifter-hole tables.
- Connection / endpoint type tables for jsPlumb overlays (see Stage G).
- Animation timings (`splashOverlay: 300`, `mapOverlay: 200`, etc.).
- Sync status config (WebSocket + SharedWorker + AJAX fallback delays).
- Performance log keys consumed by `js/app/logging.js`.

## RequireJS configuration (`js/app.js`)

### Module path aliases

`paths:` maps logical IDs to file locations. Three categories:

- **App folders re-aliased** as top-level IDs so leaf modules can `define(['dialog/foo', 'module/bar', 'layout/baz'])` without relative paths:
  - `conf → app/conf`
  - `dialog → app/ui/dialog`
  - `layout → app/ui/layout`
  - `module → app/ui/module`
  - `templates → ../../templates` (so `text!templates/xyz.html` reaches `public/templates/xyz.html`)
  - `img → ../../img`
- **Page entrypoints** as `login / mappage / setup / admin` aliases for `data-script` brevity.
- **Vendor libs** under `js/lib/` — ~40 entries spanning DOM (jQuery 3.4.1, Bootstrap 3.3.0), animation (Velocity 1.5.1 + UI pack), map rendering (**jsPlumb 2.13.1** + Farahey 1.1.2 magnetizing plugin), grids (DataTables 1.10.18 with Buttons / Responsive / RowGroup / Select / ellipsis), notifications (PNotify 4.0.0 + Buttons + Callbacks + Desktop + NonBlock), dialogs (Bootbox 5.2.0), editor (Summernote 0.8.10), charting (Morris 0.6.4 + Raphaël 2.3.0, Easy Pie Chart, Peity inline), DnD (Sortable 1.10.1, jQuery `mousewheel`, `hoverIntent`, `lazyload`, custom scrollbar), forms (xEditable 1.5.1, Validator, Select2 4.0.13, BootstrapToggle, BootstrapConfirmation), galleries (Blue-Imp Gallery + helpers + Bootstrap variant), timers (EasyTimer 4.0.2), storage (localForage 1.7.3), templating (Mustache 3.0.1), side menu (Slidebars 2.0.2).

Only one RequireJS *plugin* is registered: `text` (`lib/requirejs/text`) for loading Mustache templates and other text assets. There is **no `css!`, `json!`, or `domReady!` plugin** — CSS is loaded via `<link>` tags injected by the server template, JSON is fetched over XHR, and DOM ready is handled inside each entrypoint.

### Shims

The `shim:` block registers dependency ordering and exports for non-AMD libraries (Bootstrap → jQuery, Farahey → jsPlumb, Velocity → jQuery, all DataTables variants → datatables.net → jQuery, Morris → jQuery + Raphael, etc.). Three notable shims:

- `morris.init` runs `window.Raphael = Raphael;` because Morris reaches into the global. This is the only deliberate global leak from a shim.
- `bootbox.exports = 'bootbox'` and `select2.exports = 'Select2'` — the rest of the shims rely on module side-effects.
- Custom loaders are split out as their own AMD wrappers: `summernote.loader`, `datatables.loader`, `pnotify.loader` — these intentionally exist so the optimizer can treat them as bundle boundaries (each ships as its own concatenated file, see [Build pipeline](#build-pipeline)).

## Page entrypoints

Each entrypoint is a single AMD module with a top-level `define(...)` and an `initApp(rootEl)` (or equivalent) IIFE that fires once RequireJS has resolved its dependency graph.

### `js/app/mappage.js`

`define(['jquery', 'app/init', 'app/util', 'app/logging', 'app/page', 'app/counter', 'app/map/worker', 'app/map/util', 'app/module_map', 'app/key', 'app/ui/form_element'], ...)`

Responsibilities:
- Build the page shell via `Page.renderPage(rootEl)`.
- Initialise passive event listeners and default Bootstrap tooltip / popover / confirmation / xEditable configs.
- Fetch the initial map data from the server (`/api/Map/init` or equivalent path resolved through `Init.path.initData`).
- Start two heartbeats stored on `updateTimeouts`:
  - **mapUpdate**: POSTs deltas to `/api/Map/updateData` then schedules itself by `Util.getCurrentTriggerDelay()`.
  - **userUpdate**: separate cadence for character location / ship / pilots.
- Hand off realtime push to `MapWorker.init(...)` (see [SharedWorker + WebSocket transport](#sharedworker--websocket-transport)). If `SharedWorker` is unsupported or `onerror` fires, the heartbeats remain the sole transport — there is no SSE fallback layer, just polling.
- Wire global keyboard shortcuts via `app/key`.
- Tab-visibility observer (in `Page.initTabChangeObserver`) widens both heartbeats by ±5s when the tab is hidden.

### `js/app/login.js`

Landing page logic. Pulls `app/util` and `app/render` for the Mustache-rendered tile grid (carousel of cached "remember me" characters in `localForage`), wires the SSO redirect button, polls a server-status endpoint, and uses dialogs from `app/ui/dialog/*` for legal/credits popups.

### `js/app/setup.js`

One-time / operator install flow surfaced by `Controller\Setup`. Tests WebSocket reachability against `getWebSocketURL()` (so the operator can verify that the external `pathfinder-socket` server in Stage D is reachable from the browser before the map is enabled) and posts setup-form data over the standard `Util.request()` wrapper.

### `js/app/admin.js`

Admin panel. Loads `datatables.loader` and renders the user / corp / ally / map admin tables. Limited to its own page; does not share the map heartbeats or the WebSocket worker. Endpoints documented in [03-backend-api.md](03-backend-api.md) and [09-permissions-and-admin.md](09-permissions-and-admin.md).

## Page chrome (`js/app/page.js`)

The "chrome" — header, footer, menus, breadcrumbs, off-canvas slide-out panels — is rendered exclusively from `js/app/page.js`. Exports:

- `renderPage(rootEl) → Promise<pageEls>` — installs the full header / footer / left-menu / right-menu DOM and resolves with element handles the caller wires events on.
- `loadPageStructure()` — inner step, separates server-rendered placeholder swap from JS event binding.
- `initTabChangeObserver()` — `document.visibilitychange` observer used by `mappage.js` to throttle heartbeats.
- `renderMapContextMenus()` — installs all map-context menus; called from `mappage.js` post-render. (Map-internal context menus live under `js/app/map/contextmenu.js`, Stage G.)

Header surfaces (left → right):
- Logo + breadcrumb (region → constellation → system).
- Active-users badge (live count from heartbeat).
- Map-tracking toggle (turns off the character-position broadcast).
- Character-switch popover (templated from `templates/tooltip/character_switch.html`).
- Program-status icon (green/yellow/red, driven by `Util.setSyncStatus()`).

Footer: EVE Online server clock updated every 500ms by `app/counter`.

Side menus use **Slidebars 2.0.2** in "push" mode. Left menu: Home, Statistics, Wormhole data, Account settings, Fullscreen toggle, Logout. Right menu: Map settings, Grid snapping, Magnetizer, Compact view, System labels, Signature overlays, Manual, Shortcuts, **Task Manager** (opens the logging dialog described below).

Notifications go through PNotify with the desktop-notification plugin enabled when the browser grants permission; `Util.showNotify()` is the wrapper.

## Global utilities

### `js/app/util.js` — kitchen-sink helpers

Categories (top-level summary; the file is 2,500+ lines and is the de-facto stdlib of the frontend, so an exhaustive symbol list belongs in inline grep-on-demand, not here):

- **Overlays & splash**: `showLoadingAnimation()`, `showSplashOverlay()`, `hideSplashOverlay()` — Velocity-based.
- **Forms**: `showFormMessage()`, `resetFormFields()`, `getFormValues()` (handles xEditable inputs).
- **Tooltips & popovers**: `initDefaultTooltipConfig()`, `initDefaultPopoverConfig()`, `initDefaultConfirmationConfig()` — applied globally from each entrypoint's `initApp`.
- **Notifications**: `showNotify()` (PNotify + desktop fallback).
- **Caches & stores**:
  - `LocalStore` — typed wrapper around `localForage` (IndexedDB), with a `DataStore` layer in `app/lib/dataStore.js`.
  - `Cache` — in-memory TTL cache in `app/lib/cache.js`.
  - `SessionStorage` helpers — short-lived per-tab state.
- **Select2 / Bootbox** glue.
- **In-memory data caches**: `currentMapData`, `currentUserData`, `currentMapsData` — read/written by the heartbeats and by `module_map.js`.
- **Server sync**:
  - `Util.request(action, method, params, options)` — central AJAX wrapper that emits `pf:log` events on success / failure for the Task Manager dialog.
  - `Util.getCurrentTriggerDelay()`, `Util.setSyncStatus(status)`, `Util.getCurrentMapData()`, `Util.setCurrentMapData()`.
- **Misc helpers**: `getObjVal(obj, path)` (deep getter), `getRandomString()`, `getCookie()`, `eveImageUrl(type, id, size)` (CCP image-server URL builder), `timeStart('key')` / `timeStop('key')` for the perf log, `getVersion()` (reads `data-version` from `<body>`).

### `js/app/render.js`

Two exports:
- `render(path, data) → Promise<string>` — loads a Mustache template via `text!templates/<path>` then `Mustache.render(...)`. The only async template renderer in the codebase.
- `highlightJson(obj, options)` — produces HTML with collapsible array/object nodes. Used by debug panels. *Known quirk:* uses inline `onclick=` strings, so any value rendered through it that contains untrusted user input is an XSS risk. Currently only used to display server-returned JSON in admin tooling — the rebuild should replace this with a structural component.

### `js/app/key.js`

Global keyboard system. Maintains:
- `allCombo` — combo registry (multi-key chords like CTRL+key, ALT+key, space-then-drag).
- `allEvents` — event registry, keyed by combo, with optional element-focus requirements.
- A single set of `document.addEventListener('keydown'/'keyup')` handlers and a `MutationObserver` that auto-deregisters when the target element is removed from the DOM.

Implemented shortcuts (non-exhaustive, lives close to `mappage.js` and Stage G):
- Global: `ESC` (close dialog), `CTRL+R` (reload), `CTRL+V` (paste — handled via the native `paste` DOM event aliased into this system).
- Map: `ALT+2` (new system), `ALT+3` (new signature), `CTRL+A` (select all), `CTRL+D` (delete).
- Signature table: arrow keys (row navigation), `CTRL+Click` (multi-select).

### `js/app/counter.js`

Live countdowns / timers. Two modes:
- Per-element: a counter attached to a DOM node showing remaining time in `Xd Xh Xm Xs` format.
- Per-DataTable-column: a single registered tick updates every row in a column at once.

Ticks fire from a shared 1Hz scheduler (`app/lib/cron`), and counters auto-detach when their element leaves the DOM or the countdown hits zero. Drives skill timers, structure timers, and player-activity countdowns rendered in modules.

### `js/app/logging.js`

Performance monitoring dialog ("Task Manager"). Subscribes to the global `pf:log` event emitted by `Util.request()` and other instrumented call sites. State:
- A bounded cache (150 most recent entries).
- One Morris.js area chart per log key (`UPDATE_SERVER_MAP`, `UPDATE_SERVER_USER_DATA`, plus any custom key registered by Stage G modules).
- A DataTable with copy / CSV export.
- Per-key average and last-duration counters with green/orange/red thresholds.

Bound via `Counter` so the chart axes update at 1Hz when the dialog is open.

### `js/app/datatables.loader.js`, `js/app/summernote.loader.js`, `js/app/pnotify.loader.js`

Each is a thin AMD wrapper that depends on the relevant vendor's split sub-modules, applies project defaults (theme colours, default plugins), and re-exports the configured singleton. They exist as separate modules so the build emits one bundle per loader (see [Build pipeline](#build-pipeline)) and so individual pages can pull only the loader they need.

## Supporting libraries

### `js/app/lib/` (project-internal utilities, AMD modules)

| File | Role |
|---|---|
| `cache.js` | In-memory TTL cache class used by `util.js`. |
| `console.js` | Custom `console.*` wrapper that no-ops in production builds (gated by build flag). |
| `cron.js` | Lightweight wall-clock scheduler used by `counter.js` and `logging.js`. |
| `dataStore.js` | Typed wrapper over `localStore.js` for app data (e.g. cached character lists). |
| `dragSelect.js` | Marquee / multi-select helper used by the map (Stage G consumer). |
| `eventHandler.js` | Project-internal pub/sub: `EventHandler.emit('pf:log', payload)`. |
| `localStore.js` | localForage wrapper exposing namespaced get / set / remove. |
| `prototypes.js` | jQuery / DOM prototype extensions (e.g. `$.fn.initTooltips`, array helpers). |
| `resize.js` | Centralised `ResizeObserver` manager that fans out into per-element callbacks. |
| `svg.js` | SVG manipulation helpers used by the map for overlays and icons. |

### `js/app/conf/` (static data)

- `signature_type.js` — signature → group mappings, used by the signature dialog and the map UI.
- `system_effect.js` — system-effect bonus tables (magnetar / pulsar / etc.).

These are the only two values genuinely hard-coded in JS — everything else is hydrated from the server.

### `js/app/promises/`

- `promise.deferred.js` — classic Deferred wrapper.
- `promise.queue.js` — sequential promise queue, used to serialise map mutations during a burst of remote updates.
- `promise.timeout.js` — `Promise.race` against a timer, used by the WebSocket connect path and by `Util.request()` slow-call detection.

## SharedWorker + WebSocket transport

The realtime push transport has **two** AMD pieces on the client:

1. **`js/app/map/worker.js`** — main-thread façade. `define(['app/util'], (Util) => ...)`.
2. **`js/app/worker/map.js`** — the actual SharedWorker script (executed in the worker context, not the main thread, so it has no `define` and uses `self.addEventListener('connect', ...)`).
3. **`js/app/worker/message.js`** — the `MsgWorker` envelope class, loaded *twice*: once into the main thread (so `worker.js` can `new MsgWorker(...)` and dispatch), and once `importScripts(self.name)`-style into the SharedWorker context. The shared envelope keeps `command / task / meta / data` accessors identical on both sides.

### Construction

The main-thread façade resolves three URLs from `Util.getVersion()`:
- WebSocket endpoint: `(wss|ws)://<host>/ws/map/update` — protocol picked by `window.location.protocol`.
- SharedWorker script: `/public/js/<version>/app/worker/map.js`.
- Message-class path: `/public/js/<version>/app/worker/message.js`.

The SharedWorker is constructed as `new SharedWorker(workerScript, messageClassPath)` — passing the message-class path as the worker's `name` so the worker can `self.importScripts(self.name)` to load the same `MsgWorker` class. This is unusual but lets a single canonical copy of `MsgWorker` exist in both contexts without bundling two builds.

### Wire protocol (client side)

All messages between main thread and SharedWorker, and between SharedWorker and the socket-server, are `MsgWorker` envelopes:

```
{ command, task, meta, data }
```

Commands the main thread sends to the worker:
- `ws:init` — open the WebSocket; payload includes `{uri, characterId}`.
- `ws:send` — proxy a `{task, load}` JSON message to the WebSocket.
- `sw:closePort` — unsubscribe this tab's port.

Commands the worker emits back to the main thread (via per-tab `MessagePort.postMessage`):
- `ws:open` — `readyState`.
- `ws:send` — server message; `data` is the payload, `meta.characterIds` is the optional broadcast filter.
- `ws:closed` — `{readyState, code, reason, wasClean}`.
- `ws:error` — `{readyState}` (no body — WebSocket error events expose nothing useful).
- `sw:init` — handshake echo for `mappage.js` to confirm wiring.
- `sw:error` — emitted when `new SharedWorker(...)` throws (no worker support, CSP block, etc.).

Server messages are framed as JSON with `{task, load, characterIds}` — `characterIds` (when present) tells the worker which tabs / character ports to broadcast to; absent means broadcast to all ports. See [04-cron-and-background.md](04-cron-and-background.md) for the server side of the same protocol.

### Multi-tab behaviour

`addPort(port, characterId)` keeps two parallel registries:
- `ports[]` — every connected tab.
- `characterPorts[]` — `{characterId, port}` pairs for tabs that subscribed for a specific character (`ws:init` includes the `characterId`).

`broadcastPorts(load)` defaults to all ports, but when `meta.characterIds` is present it narrows to matching character ports. On tab close (`sw:closePort`), the worker prunes both registries and only emits an `unsubscribe` upstream when **no remaining port** still claims any of the closed character IDs — so a user with 3 tabs on the same character keeps the upstream subscription until the last tab closes.

### Fallback

If `new SharedWorker(...)` is unavailable or throws, the worker façade reports `sw:error` via `config.callbacks.onError`. `mappage.js` does not crash — the polling heartbeats continue serving as the only data path. There is no SSE / long-poll layer.

### Quirks

- `socket.onmessage` uses `this.readyState` instead of `socket.readyState` inside a `=>` callback (`js/app/worker/map.js:37`). `this` in an arrow function points to the enclosing scope, not the socket, so `readyState` is undefined in that meta block. Inconsequential because `mappage.js` ignores that field, but worth noting for the rebuild.
- `let window = {};` at the top of `js/app/worker/map.js:4` is intentional — the worker has no `window`, so it fabricates one for the imported `MsgWorker` script (which writes `window.MsgWorker = ...`).

## Build pipeline

Driver: `gulpfile.js` (~1,200 lines, Gulp 4). Build version comes from `pathfinder.ini` `[PATHFINDER] VERSION` parsed in `gulpfile.js:148`. CLI override available via `--tag=...`.

### Source layout

```
js/                       SCSS sass/
  app.js                       pathfinder.scss   ← main entry
  app/                         _*.scss           ← partials
    *.js                   img/
    map/                       header/ gallery/ svg/ *.{png,jpg,svg}
    ui/{dialog,layout,module}
    worker/, promises/, lib/, conf/
  lib/                     ← vendor (~40 libs, untouched, copied as-is)
```

### Output layout

```
public/
  js/v<version>/
    app/login.js          ← bundle (RequireJS optimizer concat)
    app/mappage.js        ← bundle
    app/setup.js          ← bundle
    app/admin.js          ← bundle
    app/pnotify.loader.js
    app/datatables.loader.js
    app/summernote.loader.js
    <every other .js>     ← copied standalone (non-combined modules)
    *.js.map / *.js.gz / *.js.br
  css/v<version>/
    pathfinder.css        ← compiled, autoprefixed, optionally clean-css'd
  img/v<version>/
    header/*-{480,780,1200,1600,3840}.{png,jpg,webp}
    gallery/**/*.{jpg,webp}
    svg/**, *.png/jpg
```

The version-suffixed folder structure is how cache busting works: `Lib\Resource` resolves `tplResource->getPath('script')` to `public/js/v<version>/` and the browser's HTTP cache picks up the new path on every release. There is **no asset fingerprinting** beyond the version folder — releases that don't bump `PATHFINDER.VERSION` will be served from the old cache.

### JS bundling — `task:concatJS`

The `task:concatJS` task runs `gulp-requirejs-optimize` (a wrapper around r.js) once per "module" in the list `['login', 'mappage', 'setup', 'admin', 'pnotify.loader', 'datatables.loader', 'summernote.loader']`. For each:

```js
{
  name: file.stem,              // e.g. 'mappage'
  baseUrl: 'js',
  mainConfigFile: './js/app.js',
  optimize: 'none',             // uglify runs as a separate pipeline step
  inlineText: false,
  removeCombined: true,
  preserveLicenseComments: false,
  findNestedDependencies: false,
  include: ['text'],            // bundle the text! plugin too
  onModuleBundleComplete: data => combinedJsFiles.push(...data.included)
}
```

Important behaviours:
- `optimize: 'none'` — r.js does **not** minify; that's done in a second pipeline step by `gulp-uglify` so source maps line up cleanly. UglifyJS options: `ecma: 8`, `keep_classnames: true`, `nameCache: {}` (shared across all minify invocations so identifiers mangle consistently between bundles).
- `inlineText: false` — `text!` plugin templates are **not** inlined into bundles; they're loaded over XHR at runtime from `templates/*.html`. The trade-off: bundles are smaller but the first render of any dialog incurs a network round trip.
- `removeCombined: true` — modules that landed in any bundle are not also emitted as standalone files (the bundle is canonical).
- `combinedJsFiles` is a module-level set across the whole build; `task:diffJS` later filters it out so each source file is emitted exactly once.

### JS standalone — `task:diffJS`

Everything under `js/**/*.js` that did **not** end up inside one of the 7 bundles (`!file.path in combinedJsFiles`) is copied straight to `public/js/v<version>/<same path>`, with optional minify + sourcemap. This is how worker scripts (`app/worker/map.js`, `app/worker/message.js`) reach the output — they cannot be bundled because the browser fetches them as separate HTTP resources.

### Compression

- `gzip` (`gulp-gzip`, level 9, 1KB threshold, `skipGrowingFiles: true`) — emits `.gz` next to `.js` / `.css`.
- `brotli` (`gulp-brotli`, `BROTLI_MAX_QUALITY`, `BROTLI_MODE_TEXT`, `skipLarger: true`) — emits `.br`.

Web server is expected to serve `.gz` / `.br` if the client `Accept-Encoding` matches.

### CSS — `task:sass`

`sass/**/*.scss` → `node-sass` (compressed output) → `autoprefixer` → optional `gulp-clean-css` (level 2) → `public/css/v<version>/`. Optional source maps with `sourceRoot: '../../../sass'` so DevTools resolves back to the original SCSS files. `clean-css` is wired but not in the default pipeline — it's available as `task:cleanCss`.

### Images — `task:buildImg`

- `img/header/*` is resized to 480 / 780 / 1200 / 1600 / 3840 widths in both PNG and JPG, then PNGs are additionally converted to WebP at quality 80.
- `img/gallery/*` is copied through as JPG and also converted to WebP at quality 90.
- `img/svg/*` and the remainder are copied without processing.

### Production vs. development

- `gulp default` (dev): no uglify, no source maps, no gzip / brotli, file watchers via `gulp.watch` on `js/**/*.js`, `sass/**/*.scss`, `img/**/*` running `task:watchJsSrc` / `task:watchCss` / `task:watchImg`. `node-notifier` pops a desktop notification when each watcher finishes.
- `gulp production`: full uglify + source maps + gzip + brotli, single pass, no watchers.
- `gulp images` (standalone) and `gulp help` round out the public tasks.

### Lint — `task:hintJS`

JSHint (`.jshintrc` at repo root) reported via `jshint-stylish`. Wired into the dev watcher (`task:watchJsSrc`) before the diff build, so source-file save triggers lint immediately. Not gated — failing lint does not abort the build.

### npm scripts (`package.json`)

Only one script: `npm run gulp -- <task> [--option=value]`. Everything else flows through Gulp.

## Heartbeat / sync model (client view)

This is the client-side picture of the sync mechanics whose server side lives in Stage D.

```
mappage.js initApp
  └─ Page.renderPage
  └─ Util.request('initData')  ─► /api/Map/init  (one-shot)
  └─ MapWorker.init({characterId, callbacks:{...}})
  │     └─ new SharedWorker('/public/js/v.../app/worker/map.js', '/.../message.js')
  │     └─ port.postMessage(ws:init)  ──► worker  ──► new WebSocket('wss://host/ws/map/update')
  ├─ initMapUpdatePing()  ─► /api/Map/updateData every Util.getCurrentTriggerDelay()
  └─ initUserUpdatePing() ─► /api/User/updateUserData every Util.getCurrentTriggerDelay()
```

On every successful AJAX cycle `Util.setCurrentMapData(response)` is called and `module_map.updateMapModule()` re-renders the visible map; the WebSocket bypasses the AJAX hop and feeds directly into `ModuleMap.updateMapModule` with deltas tagged by `task`. The two paths are not interlocked — a WebSocket update applied mid-cycle will be overwritten or re-applied by the next AJAX cycle depending on server-side merge logic.

When `Page.initTabChangeObserver` reports the tab hidden, `Util.setCurrentTriggerDelay` adds a ~5s padding to both heartbeats; on visible it removes it. WebSocket pushes continue at normal cadence regardless.

## Known issues / quirks

- **Two-step `baseUrl` swap (`js/app.js`).** Mature pattern, but undocumented. Anyone adding a new top-level alias must add it to `paths:` *before* the `require.config({ baseUrl: jsBaseUrl })` swap or it won't resolve in production.
- **Inline `onclick` in `render.highlightJson`** (XSS hazard described above).
- **`SharedWorker` is the only realtime path** — Firefox-Android and some embedded WebKits don't ship it. The fallback is polling at whatever `Util.getCurrentTriggerDelay()` returns. There is no SSE alternative.
- **`socket.onmessage` arrow `this` bug** described in [Quirks](#quirks).
- **Templates loaded by `text!templates/...`** are not bundled (`inlineText: false`). Opening a dialog for the first time always hits the network. Acceptable for desktop on a fast connection; the rebuild should bundle templates or migrate to JSX-style co-located components.
- **No cache fingerprinting beyond the version folder.** A release that forgets to bump `PATHFINDER.VERSION` will ship a stale browser-cached bundle until the user hard-reloads. The build itself does not warn about this.
- **`combinedJsFiles` is module-level shared state in `gulpfile.js`.** It works because Gulp runs `task:concatJS` before `task:diffJS` in series, but it is *not* idempotent across `gulp.watch` triggers — the watcher path is dev-only, where dev mode does not run `task:concatJS`, so the state stays empty and `task:diffJS` copies everything. Fine in practice; a footgun if anyone runs `task:concatJS` from the watcher path.
- **Worker URL is hard-coded to `/public/js/<version>/...`** (`js/app/map/worker.js:28`). Any reverse-proxy that doesn't expose `/public/...` at the root will break the SharedWorker.
- **Init config has no schema.** `Init.path.*`, `Init.signatureGroups`, and ~30 other shapes are read by name across dozens of files. The rebuild should type these.
- **40+ vendor libs at floor-level versions** — Bootstrap 3, jQuery 3.4, jsPlumb 2.13, Velocity 1.5. Almost all are unmaintained upstream. The rebuild should re-pick.
- **No TypeScript, no ES modules, no lint failure gate.** JSHint runs but doesn't break the build.

## Open questions

- Where is `Init.path.initData` actually set? `js/app/init.js` is empty; `mappage.js` reads from it. Confirm whether the controller pre-renders the path into a `<script>` block (likely in `view/index.html` via a `tplInitPaths` value not yet documented) or whether RequireJS pulls it from a `text!` resource. → revisit when documenting `Lib\Resource` in Stage A follow-up.
- Does the SharedWorker actually receive a separate `MsgWorker` instance per tab, or is the class shared across the worker context? The current code does `Object.setPrototypeOf(MsgWorkerMessage, MsgWorker.prototype)` on receive, which only makes sense if structured-clone strips the prototype — confirm against MDN expectations.
- What happens to in-flight `Util.request()` promises when the heartbeat schedules a new request before the previous one resolves? `pf:log` instrumentation suggests there's no per-key in-flight guard. → Stage G should answer this when documenting `module_map.updateMapModule`.
- `js/app/lib/console.js` claims to no-op in production, but the dev/prod switch isn't wired through the build flags listed in `gulpfile.js`. Find the gating mechanism (Uglify dead-code elimination on a hard-coded constant? An ENV check at runtime?) and document it.
- The `text!` plugin is `include`d in every bundle — does the optimizer therefore also inline templates referenced by bundle-internal modules, or only inline the *plugin code* itself? `inlineText: false` says no, but verify against an actual built bundle.

## Self-check (per Stage F checklist)

- [x] Every file in this stage's "Critical files" list read or explicitly skipped with reason. (`js/app.js`, `js/app/init.js`, `js/app/mappage.js`, `js/app/login.js`, `js/app/setup.js`, `js/app/admin.js`, `js/app/page.js`, `js/app/util.js`, `js/app/render.js`, `js/app/key.js`, `js/app/counter.js`, `js/app/logging.js`, `js/app/module_map.js`, `js/app/worker/*.js`, `js/app/map/worker.js`, `gulpfile.js`, `package.json`, `js/app/lib/*`, `js/app/promises/*`, `js/app/conf/*`. Map internals deferred to Stage G as agreed in the plan.)
- [x] Every public entry point in scope appears: 4 page entrypoints (`login` / `mappage` / `setup` / `admin`), 3 loader bundles (`pnotify.loader` / `datatables.loader` / `summernote.loader`), the SharedWorker (`app/worker/map.js`) + message class (`app/worker/message.js`), the main-thread worker façade (`app/map/worker.js`).
- [x] Open questions listed above, not silently dropped.
- [x] Feature matrix updates — `10-feature-matrix.md` will gain rows for "RequireJS module graph / build cache busting", "Task Manager / performance logging dialog", "SharedWorker realtime push", "Slidebars off-canvas menus" when Stage I completes the audit; no new rows added inline here to keep this stage's diff contained.
