# Pathfinder Documentation & Rebuild — Staged Plan

## Context

Pathfinder is a legacy wormhole-mapping tool for EVE Online (Fat-Free Framework PHP backend + RequireJS/jQuery/jsPlumb frontend + MySQL, with a separate static "eve_universe" DB). The codebase has accreted over many years, breaks whenever CCP changes ESI/SSO, and is hard to maintain. The end-state goal is a **rebuild on a modern stack (Next.js + TypeScript)**, but before any rebuild can happen we need a complete, behavior-level specification of what the current app actually *does* — every feature, background task, API endpoint, UI surface, data model, and external integration.

This plan covers **Stage 1: documentation only**. It is intentionally staged because the codebase is large enough that a single planning/execution pass would either lose fidelity or blow the context window:

- ~154 PHP files (Controllers, Cron, Models split across `Pathfinder/` and `Universe/`, Lib, Data, Db)
- ~114 JS files (frontend in `js/app/`, with `map/map.js` at 3,441 LOC, `map/util.js` at 2,301 LOC, plus UI modules, dialogs, workers)
- 420-line `pathfinder.ini` feature config
- 9 scheduled cron jobs across 5 cron classes
- REST + AJAX API surface (`routes.ini`) plus SSE / WebSocket-style realtime (`react/socket`, `clue/ndjson-react`)
- EVE-specific integrations: ESI (via `monoliyoda/pathfinder_esi`), CCP SSO, EVE static data export
- Server-rendered PHP templates in `public/templates/` (layout, dialog, modules, mail, etc.)

### Suggested approach refinement

Rather than producing one giant document, I recommend a **modular, append-only docs/ tree** inside the repo (e.g. `docs/spec/`) where each stage adds one or more focused markdown files. This keeps each file reviewable, lets later stages link to earlier ones, and gives the rebuild team a navigable reference instead of a 200-page monolith. The final "spec for rebuild" is then assembled in Stage 7 as a thin top-level document that cross-links the modules.

If the user prefers a single-document deliverable, swap the per-stage outputs for sections in one growing `SPEC.md` — the stage breakdown stays the same.

---

## Deliverables (target structure)

```
docs/spec/
  00-overview.md                  ← system context, stack, glossary, EVE-domain primer
  01-config-and-deployment.md     ← all *.ini files, env vars, deploy/runtime topology
  02-data-model.md                ← every Model class, table, relationship, lifecycle
  03-backend-api.md               ← every route in routes.ini, every controller action,
                                    request/response shape, auth, throttling, errors
  04-cron-and-background.md       ← every cron job + every async/socket worker
  05-external-integrations.md     ← ESI, SSO, CCP universe import, webhooks, mail
  06-frontend-architecture.md     ← RequireJS module graph, page flows, build pipeline
  07-frontend-map-engine.md       ← the map canvas: jsPlumb, drag/snap, magnetize,
                                    realtime sync, signatures, connections, overlays
  08-frontend-ui-modules.md       ← every dialog, every system_* module, header/local,
                                    contextmenus, forms, notifications
  09-permissions-and-admin.md     ← roles, rights, corp/alliance scopes, admin panel
  10-feature-matrix.md            ← flat checklist of every user-visible feature,
                                    cross-referenced to the sections above
SPEC.md                           ← assembled rebuild spec (Stage 7)
```

---

## Stages

Each stage is sized to run as its own session. Stages are mostly independent and can be re-ordered if a particular area becomes urgent, with the noted dependencies.

### Stage A — Inventory & Overview *(do first)*
**Output:** `docs/spec/00-overview.md`, `docs/spec/01-config-and-deployment.md`, `docs/spec/10-feature-matrix.md` (skeleton only).

- Read every `app/*.ini` end-to-end and document every key.
- Document `index.php` bootstrap, `Lib/Config.php` loading, env detection.
- Identify caching backends (Redis/file/array/void), session handling, logging targets (`logs/`, `history/`).
- Produce the **feature matrix skeleton** — a flat checklist of user-visible features derived from `pathfinder.ini` flags, route names, dialog filenames, and module filenames. This becomes the master checklist that subsequent stages fill in.
- Glossary of EVE terms used in code (wormhole, K-space, signature, mass, EOL, system effect, sov, faction war, structure, etc.).

**Critical files:** `index.php`, `app/*.ini`, `app/Lib/Config.php`, `app/Controller/AppController.php`, `composer.json`, `gulpfile.js`, `package.json`.

### Stage B — Data Model
**Output:** `docs/spec/02-data-model.md`. Depends on A (glossary).

- Walk every class under `app/Model/Pathfinder/` (35 files) and `app/Model/Universe/` (22 files).
- For each model: table name, fields & types, relationships (Cortex ORM annotations), validation rules, lifecycle hooks, scopes, soft-delete behavior, indexes.
- Diagram the two DBs: the live "pathfinder" DB (maps, characters, signatures, connections, activity logs) vs. the static "eve_universe" DB (systems, stargates, regions, types).
- Document `app/Db/`, `AbstractModel.php`, and `AbstractMapTrackingModel.php` (change tracking / activity log mechanics).
- Capture the export/SQL bootstrap (`export/sql/eve_universe.sql.zip`).

**Critical files:** `app/Model/AbstractModel.php`, `app/Model/Pathfinder/Abstract*.php`, `app/Db/`, all `MapModel`/`SystemModel`/`ConnectionModel`/`CharacterModel`/`UserModel`/`SignatureModel` files.

### Stage C — Backend HTTP API
**Output:** `docs/spec/03-backend-api.md`, `docs/spec/09-permissions-and-admin.md`. Depends on A, partially on B.

- Expand every route in `routes.ini` (page routes, `/api/...` ajax, `/api/rest/...` REST, `/sso/...`, `/setup`, `/admin*`).
- For each controller action under `app/Controller/` (especially `Api/`, `Api/Rest/`, `Ccp/`, `MapController`, `Admin`, `AccessController`, `Setup`): inputs, outputs, side effects, auth requirements, throttle limits (the `512` arg in routes).
- Document the access-control system: `RightModel`, `RoleModel`, corp/alliance scopes, `CharacterStatusModel`, admin gating.
- Document `Setup.php` — the one-time DB setup flow that ships in production routes.
- Document `Controller/Ccp/Sso.php` SSO flow (handoff to Stage E for ESI-level detail).

**Critical files:** `app/routes.ini`, all of `app/Controller/`, especially `Api/Map.php`, `Api/System.php`, `Api/User.php`, `Api/Access.php`, `Api/Rest/*`, `Admin.php`.

### Stage D — Cron & Background Workers
**Output:** `docs/spec/04-cron-and-background.md`. Depends on B.

- Document each of the 9 jobs in `cron.ini` (already enumerated): trigger schedule, what it touches, failure modes.
- Walk each cron class in `app/Cron/` and document its public job methods.
- Identify any long-lived processes / sockets: `react/socket`, `clue/ndjson-react` usage (likely TCP socket server for real-time map push) — find its entry point and document protocol & message types.
- Document `app/Lib/Socket/` or equivalent if present; document map-history log writing.

**Critical files:** `app/cron.ini`, `app/Cron/*.php`, anything under `app/Lib/` with "Socket"/"Stream"/"Server" in the name.

### Stage E — External Integrations
**Output:** `docs/spec/05-external-integrations.md`. Depends on C, D.

- Document every ESI call site (`monoliyoda/pathfinder_esi` is a vendor package — list which endpoints are used and where).
- Document CCP SSO OAuth2 flow end-to-end (token storage in `CharacterAuthenticationModel`, refresh, scopes requested per `pathfinder.ini`).
- Document outbound mail (SwiftMailer templates in `public/templates/mail/`).
- Document GitHub controller (`Api/GitHub.php`) — likely changelog fetch.
- Document static-data import path (Universe cron + CSV exports in `export/csv/`).

**Critical files:** `app/Controller/Ccp/`, `app/Controller/Api/GitHub.php`, `app/Lib/Esi*` if any, `vendor/monoliyoda/pathfinder_esi` (read-only browse for endpoint list), `public/templates/mail/`.

### Stage F — Frontend Architecture & Build
**Output:** `docs/spec/06-frontend-architecture.md`. Depends on A.

- Document `js/app.js` (RequireJS config), `js/app/init.js`, page entrypoints (`mappage.js`, `login.js`, `setup.js`, `admin.js`).
- Module dependency graph (top-level — leaf modules covered in G/H).
- Document `js/app/util.js`, `js/app/render.js`, `js/app/page.js`, `js/app/key.js` (shortcuts), `js/app/counter.js`, `js/app/logging.js`.
- Document the build: `gulpfile.js`, SCSS pipeline, output to `public/css/` & `public/js/`, RequireJS optimizer config.
- Document client-side workers (`js/app/worker/`, `js/app/map/worker.js`).
- Document realtime/push transport from the client side (matches Stage D's server side).

**Critical files:** `js/app.js`, `js/app/init.js`, `js/app/mappage.js`, `js/app/page.js`, `js/app/util.js`, `gulpfile.js`.

### Stage G — Frontend Map Engine *(largest stage — may need to split)*
**Output:** `docs/spec/07-frontend-map-engine.md`. Depends on B, F.

This is the heart of the app and the biggest single area. Files involved:
- `js/app/map/map.js` (3,441 LOC) — main map renderer
- `js/app/map/system.js` (839 LOC) — system node rendering & behavior
- `js/app/map/util.js` (2,301 LOC) — geometry, helpers
- `js/app/map/connection*`, `contextmenu.js`, `layout.js`, `local.js`, `magnetizing.js`, `scrollbar.js`, `worker.js`, `overlay/`
- `js/app/module_map.js`

Document:
- jsPlumb usage & wrapper layer
- System node lifecycle (create, move, drag, snap-to-grid, magnetize, delete)
- Connection lifecycle (create via drag, type cycling — wh/jb/stargate, mass/EOL flags, frigate-hole, K162)
- Realtime sync: how local edits broadcast and how remote edits apply (conflict handling, optimistic updates)
- Map history / undo
- Layouts (auto-layout algorithms)
- Local-pilots indicator
- Overlay system (route, intel overlays)

If this stage runs long, **split into G1 (engine + nodes + connections) and G2 (realtime + overlays + layouts)**.

### Stage H — Frontend UI Modules & Dialogs
**Output:** `docs/spec/08-frontend-ui-modules.md`. Depends on G partially.

- Each dialog in `js/app/ui/dialog/` (14 dialogs): trigger, fields, validation, server calls, success path.
- Each module in `js/app/ui/module/` (13 modules — system_info, system_signature, system_intel, system_killboard, system_route, system_graph, connection_info, global_thera, dotlan, tags, demo, empty, base).
- Header / login layout, form elements, notifications (pnotify), summernote, datatables loaders.
- Map page UI shell: how modules dock/undock around the map canvas.
- Templates in `public/templates/` map to which JS module.

**Critical files:** `js/app/ui/**`, `public/templates/**`.

### Stage I — Feature Matrix Completion & Cross-Reference Audit
**Output:** completed `docs/spec/10-feature-matrix.md`. Depends on all prior.

- Fill the Stage-A skeleton: every feature → linked spec section(s), DB tables touched, API endpoints involved, cron interactions.
- Pass over all stage docs and resolve `TODO`/`?` markers.
- Identify dead code (features in `pathfinder.ini` that are commented/disabled, half-finished WIP jobs like `updateUniverseSystems`).
- Identify EVE-specific footguns that broke historically (anything CCP-API-shape-dependent).

### Stage J — Rebuild Spec Assembly
**Output:** top-level `SPEC.md`.

- Thin assembly document: requirements (functional + non-functional), proposed Next.js architecture mapping (App Router pages ↔ current routes; API routes ↔ current controllers; server actions / WebSocket strategy for realtime; Prisma/Drizzle schema derived from Stage B; auth via NextAuth + EVE SSO provider).
- Explicit list of legacy behaviors to **keep**, **drop**, and **redesign**.
- Phased migration path (e.g., parallel deploy, data export/import, feature parity gates).

This is the only stage that produces forward-looking design rather than documentation; it is intentionally last so it builds on a fully-mapped present state.

---

## Working method (applies to every stage)

- Per stage: spawn Explore subagents in parallel against the listed critical files, then write the doc file inline.
- Each doc file should follow a uniform template: **Purpose · Surface area · Inputs · Outputs · Side effects · Dependencies · Known issues / quirks · Open questions**.
- Quirks and known issues matter — the rebuild team needs to know *why* something is the way it is, not just *what* it does. Note CCP-API breakage history wherever it shows up in comments/commits.
- Cross-link with relative markdown links between stage outputs.
- Update `10-feature-matrix.md` opportunistically as each stage runs (don't wait for Stage I).

## Verification

Documentation has no executable verification, but each stage should end with a self-check:
1. Every file in that stage's "Critical files" list has been read or explicitly skipped with reason.
2. Every public entry point in scope (route, cron job, exported JS module, dialog) appears in the doc.
3. Open questions are listed at the bottom of the doc — not silently dropped.
4. The feature matrix has new rows or filled-in links from this stage.

## Recommended first action after approval

Execute Stage A. It's the smallest, unblocks everything else, and produces the feature-matrix skeleton that gives the user (and us) a tangible sense of total scope before committing to the larger stages.