# Pathfinder — Rebuild Specification

**Stage J output.** This is the assembly document for the rebuild. It does **not** restate behavior — it points at the behavior-level spec (Stages A–I) and adds the forward-looking decisions on top.

If you are about to write code, start here, then drill into the linked source doc for the layer you are implementing.

---

## 1. Purpose & scope

Pathfinder is a collaborative wormhole-mapping web app for EVE Online ([00 § Purpose](00-overview.md)). The current implementation — Fat-Free Framework + RequireJS/jQuery/jsPlumb + dual MySQL — has been documented in full at the behavior level across nine spec files totalling ~5,000 lines. This document converts that present-state spec into a rebuild blueprint on **Next.js + TypeScript + Drizzle + Postgres**.

**This document contains:**
- Goals, non-goals, and functional / non-functional requirements (§§2–4).
- Target architecture mapped onto the App Router (§5).
- Data model and persistence strategy (§6).
- Auth strategy (§7).
- The authoritative **Keep / Drop / Redesign** matrix (§8) — restating [10 § Hand-off to Stage J](10-feature-matrix.md#hand-off-to-stage-j).
- Phased migration path with feature-parity gates (§§9–10).
- Open questions that must be resolved before code commits (§11).
- Cross-doc index (§12).

**This document does not contain** API shape, schema details, or UI behavior. Those live in the source docs and are linked inline.

## 2. Goals & non-goals

### Goals

- **Feature parity** with the rows enumerated in [10 §§ 1–14](10-feature-matrix.md) except those explicitly listed in §8 Drop.
- **Self-hostable** by EVE corps/alliances ([00 Open Q answer](00-overview.md#open-questions)) — single `docker compose up` should be enough.
- **Real-time multi-tab sync** that survives a tab refresh, character switch, and proxy reconnect. Current behavior: SharedWorker + WebSocket envelope ([04 § Realtime push pipeline](04-cron-and-background.md#realtime-push-pipeline), [06 § SharedWorker + WebSocket transport](06-frontend-architecture.md#sharedworker--websocket-transport)).
- **CCP-resilient** — every ESI / SSO interaction tolerates schema drift, rate limits, and downtime ([00 § Known issues](00-overview.md#known-issues--quirks-high-level), [10 § CCP-API footgun history](10-feature-matrix.md#ccp-api-footgun-history)).
- **Persisted SSO refresh-token rotation** — fixes [10 footgun #2 / Q4](10-feature-matrix.md#ccp-api-footgun-history) which is the highest-priority latent bug in the present codebase.
- **No optional separate process** required for realtime — the current `KitchenSinkhole/pathfinder_websocket` repo silently no-ops if absent ([04 § Realtime push pipeline](04-cron-and-background.md#realtime-push-pipeline) / [10 dead-code table](10-feature-matrix.md#dead--disabled--wip-inventory)). Realtime must be part of the same deployment unit.

### Non-goals

- Mobile-first or native apps. Map editing is desktop / pointer-driven by design ([07 § map.js — renderer](07-frontend-map-engine.md#mapjs--renderer)).
- A plugin ecosystem. `BaseModule.isPlugin` scaffolding ships unused ([08 § Open questions](08-frontend-ui-modules.md#open-questions)) and is dropped (§8).
- Email broadcasts. SwiftMailer + Monolog mail handler are stripped (§8) — webhook channels stay.
- Backwards compatibility with the legacy AJAX/REST URL shapes. The new endpoints will be conceptually 1:1 but free to rename.

## 3. Functional requirements

Derived from [10 §§ 1–14](10-feature-matrix.md). The rebuild must implement every row in those tables that is **not** flagged ✗ in [10 § 15 Disabled / WIP / open](10-feature-matrix.md#15-disabled--wip--open) or in §8 below. The spec for behavior is the linked source doc — do not re-derive from code.

| Capability area | Source doc | Notes for the rebuild |
|---|---|---|
| Authentication & accounts | [10 § 1](10-feature-matrix.md#1-authentication--accounts), [09 § Auth principals](09-permissions-and-admin.md#auth-principals), [05 § 2 CCP SSO](05-external-integrations.md#2-ccp-sso-oauth-20--jwt) | Multi-character switch is a hard requirement; cookies-based "Remember me" needs a migration window (§7). |
| Map lifecycle (create / share / delete / expire) | [10 § 2](10-feature-matrix.md#2-map-lifecycle), [03 § REST API](03-backend-api.md#rest-api--apirestresourceid), [02 § 9 core entities](02-data-model.md#9-pathfinder-models--core-entities) | Three scopes (private / corp / alliance), per-scope limits (`MAX_COUNT`, `MAX_SYSTEMS`, `LIFETIME`) come from [01 § pathfinder.ini](01-config-and-deployment.md#app-pathfinderini--application-feature-flags). |
| Systems on the map | [10 § 3](10-feature-matrix.md#3-systems-on-the-map), [07 § System-node lifecycle](07-frontend-map-engine.md#system-node-lifecycle-systemjs--mapjs) | Includes rally point, intel notes, system tags, route, graph, killboard. |
| Connections (wormhole edges) | [10 § 4](10-feature-matrix.md#4-connections-wormhole-edges), [07 § Connection lifecycle](07-frontend-map-engine.md#connection-lifecycle) | Type cycling, mass/EOL/frigate/preserve-mass flags, auto-expiry. |
| Signatures | [10 § 5](10-feature-matrix.md#5-signatures), [02 § 9 core entities](02-data-model.md#9-pathfinder-models--core-entities) | D-Scan paste, signature paste reader, signature history versioning. |
| Realtime sync | [10 § 6](10-feature-matrix.md#6-realtime--multi-user), [04 § Realtime push pipeline](04-cron-and-background.md#realtime-push-pipeline) | Task vocabulary fixed: `mapUpdate`, `mapAccess`, `mapConnectionAccess`, `mapDeleted`, `characterUpdate`, `characterLogout`, `healthCheck`, `logData`, plus client→server `subscribe`/`unsubscribe`. |
| Notifications & broadcasts | [10 § 7](10-feature-matrix.md#7-notifications--broadcasts), [05 § 6 mail](05-external-integrations.md#6-outbound-mail-swiftmailer) | Slack + Discord webhooks kept; mail dropped (§8). |
| Admin / operator | [10 § 8](10-feature-matrix.md#8-admin--operator), [09 § Admin panel](09-permissions-and-admin.md#admin-panel----admin) | Maps list, members, notification config, global settings, kick / ban / activate / hard-delete actions. |
| External integrations | [10 § 9](10-feature-matrix.md#9-external-integrations), [05](05-external-integrations.md) | CCP SSO + ESI (≈38 opKeys), zKillboard, EVE-Scout, DOTLAN/EVEEYE/Anoik deep links, CCP image server, GitHub changelog. |
| Permissions & access control | [10 § 10](10-feature-matrix.md#10-permissions--access-control), [09](09-permissions-and-admin.md) | Roles (MEMBER / CORPORATION / SUPER) + per-action rights + map access lists + character status. |
| Logging & history | [10 § 11](10-feature-matrix.md#11-logging--history), [04 § Map history pipeline](04-cron-and-background.md#map-history-pipeline) | Activity log (DB) + map history (file, NDJSON) + Monolog channels. |
| Caching | [10 § 12](10-feature-matrix.md#12-caching) | Redis-first in the rebuild (was filesystem-default). |
| UI shell & ergonomics | [10 § 13](10-feature-matrix.md#13-ui-shell--ergonomics), [06 § Page chrome](06-frontend-architecture.md#page-chrome-jsapppagejs), [08](08-frontend-ui-modules.md) | Header, footer, splash, status pages, module dock, shortcuts, gallery, task manager. |
| Build & assets | [10 § 14](10-feature-matrix.md#14-build--assets), [06 § Build pipeline](06-frontend-architecture.md#build-pipeline) | Replaced wholesale by Next.js build (§5). |

Every dialog and module listed under [08 § Module / dialog inventory](08-frontend-ui-modules.md#module--dialog-inventory) and [10 §§ 1–14](10-feature-matrix.md) is in scope unless dropped in §8.

## 4. Non-functional requirements

| NFR | Source / rationale | Acceptance |
|---|---|---|
| Self-host complexity | [00 Q answer](00-overview.md#open-questions) | One `docker-compose.yml` brings up the app, Postgres, Redis. No separate socket-server repo. |
| Realtime liveness | [04 § Known issues](04-cron-and-background.md#known-issues--quirks) (silent no-op) | If realtime is unhealthy, the UI must surface a degraded-mode banner — never silently render stale state. |
| ESI failure modes | [05 § 3 CCP ESI](05-external-integrations.md#3-ccp-esi-game-data), [00 § Known issues](00-overview.md#known-issues--quirks-high-level) | Per-endpoint circuit breakers; downtime window (`±8m` around `CCP_SSO_DOWNTIME`) treated as expected. ESI shape drift survives via Zod-validated response decoders. |
| Refresh-token rotation | [10 footgun #2](10-feature-matrix.md#ccp-api-footgun-history) (high-priority bug) | Rotated `refresh_token` from every SSO response is persisted to `character_authentication` before the new access token is used. Verified by integration test. |
| Authoritative session storage | [00 § Known issues](00-overview.md#known-issues--quirks-high-level) (MySQL sessions) | Stateless JWT cookie (preferred) or Redis-backed sessions. No DB-table session store. |
| Background jobs | [04 § Job inventory](04-cron-and-background.md#job-inventory) | Same 13 jobs (or replacements that achieve the same outcomes) run reliably without F3-Cron. Must be observable (job duration, failure count). |
| Map history file leak | [10 footgun "history file purge"](10-feature-matrix.md#dead--disabled--wip-inventory) | History storage is bound to map lifetime — hard-deleting a map must cascade. |
| Static-data drift | [10 footgun #4](10-feature-matrix.md#ccp-api-footgun-history) (Pochven/Zarzakh) | Static-data refresh is driven by streaming SDE + ESI deltas, not patch SQL files. Adding a new region/system requires zero schema work. |
| Throughput | Not measured in present-state docs | Out of scope to specify a number; rebuild should preserve responsiveness on a single small VPS (current deploy target). Capture baselines during Phase 0. |
| Auth-cookie compatibility | [10 footgun #7](10-feature-matrix.md#ccp-api-footgun-history) | A migration window where the new app reads legacy selector+validator cookies once, re-issues a new format, and discards. |

## 5. Target architecture

**Stack:** Next.js 15+ (App Router) · React 19 · TypeScript 5+ · Drizzle ORM · Postgres 16 · Redis 7 · Auth.js v5 · Node 22 LTS.

### 5.1 Routes

| Surface | Current ([03](03-backend-api.md)) | Rebuild (App Router) |
|---|---|---|
| Login | `GET /` → `AppController->init` | `app/(public)/page.tsx` |
| Map | `GET /map*` → `MapController->init` | `app/(app)/map/[[...slug]]/page.tsx` (catch-all preserves bookmark URLs) |
| Setup | `GET /setup` → `Setup->init` | `app/(setup)/setup/page.tsx` — gated by proxy HTTP Basic per [03 Q1 answer](03-backend-api.md#open-questions) |
| Admin | `GET /admin*` → `Admin->dispatch` | `app/(admin)/admin/[[...slug]]/page.tsx` |
| SSO callback | `GET /sso/<action>` → `Ccp\Sso` | `app/api/auth/[...nextauth]/route.ts` (Auth.js handles) |
| AJAX API (26 actions) | `/api/<Controller>/<action>` | `app/api/<resource>/<action>/route.ts` route handlers |
| REST API (30+ verbs) | `/api/rest/<Resource>[/<id>]` | `app/api/rest/[resource]/[[...id]]/route.ts` — `GET/POST/PUT/PATCH/DELETE` exports |
| Beacon | `POST /api/Map/updateUnloadData` | `navigator.sendBeacon` → `app/api/map/unload/route.ts` |

The AJAX/REST split is preserved conceptually but rebuilt as plain HTTP+JSON. F3's `(ttl, kbps)` throttle args have no analogue; protect against abuse via Auth.js session + an `@upstash/ratelimit`-style middleware.

**Server Actions** are used for low-traffic state changes where a fresh page render is the natural next step: account settings save, map create / delete, admin settings save. High-frequency endpoints (map updates, system / connection mutations, signature edits) stay as JSON API routes consumed by the client.

### 5.2 Realtime transport

Replace `react/socket` + `clue/ndjson-react` + the external `KitchenSinkhole/pathfinder_websocket` process with **native WebSockets served by the same Next.js deployment**.

Recommended approach:
- **Edge or Node runtime WebSocket route** — Next.js supports WebSocket upgrade in custom server (Node) deployments; for serverless deployments use a managed service (Ably / Pusher / Soketi) behind the same auth.
- **Postgres `LISTEN/NOTIFY`** for fanout between server instances when scaling beyond a single Node process. Avoids a separate Redis pub/sub layer.
- **Task vocabulary** inherited verbatim from [04 § Realtime transport coverage](10-feature-matrix.md#realtime-transport-coverage-stage-d) — `mapUpdate`, `mapAccess`, `mapConnectionAccess`, `mapDeleted`, `characterUpdate`, `characterLogout`, `healthCheck`, `logData`, `subscribe`, `unsubscribe`. Payload shapes are an open question (§11 Q3).

The browser side keeps the **SharedWorker** pattern from [06 § SharedWorker + WebSocket transport](06-frontend-architecture.md#sharedworker--websocket-transport) so a character with multiple tabs holds exactly one socket. SharedWorker is well-supported in current Chromium / Firefox; Safari gap is acceptable (matches current product support).

### 5.3 Background jobs

The 13 jobs from [04 § Job inventory](04-cron-and-background.md#job-inventory) are reimplemented as a single Node job runner. Recommended: **BullMQ on Redis** (already-required dependency). Each job is one BullMQ Queue with a cron repeat. Disabled jobs (`updateUniverseSystems`, `Cron\Universe::setup`) are dropped — `setup` becomes a one-shot CLI command per §8.

Per-request "background" work ([04 § Per-request background work](04-cron-and-background.md#per-request-background-work)) — the activity-log buffer flush in `Controller::unload` — moves to an `after()` hook on Server Actions or a flush-on-response wrapper for API routes.

### 5.4 Frontend

- **Page chrome** ([06 § Page chrome](06-frontend-architecture.md#page-chrome-jsapppagejs)) — React components; off-canvas Slidebars replaced with shadcn/ui `Sheet`.
- **Dialogs** ([08 § Per-dialog specs](08-frontend-ui-modules.md#per-dialog-specs)) — 13 dialogs become route-modal `parallel` slots or `<Dialog>` components.
- **Modules** ([08 § Per-module specs](08-frontend-ui-modules.md#per-module-specs)) — 13 modules become React components inside the map page shell; tabs / docking via a grid layout primitive (CSS grid + Framer Motion or `react-grid-layout`).
- **Map engine** ([07](07-frontend-map-engine.md)) — **the single highest-risk slice.** jsPlumb + 3,441 LOC of `map.js` need a deliberate port. Two approaches:
  1. Keep jsPlumb in a React wrapper. Lowest behavior risk; carries 2.x → community-edition friction.
  2. Re-author on `react-flow` (xyflow). Modern but the magnetize / overlay / drag-select features ([07 § Auxiliary modules](07-frontend-map-engine.md#auxiliary-modules)) need re-implementation.

   Recommendation: **prototype both in Phase 1**, pick before Phase 2.
- **DataTables / Summernote / PNotify** — replaced by TanStack Table, Tiptap, and sonner (or shadcn `Sonner`) respectively.

### 5.5 Deployment topology

```
┌──────────────────────────────────────────┐
│ Next.js (Node runtime)                   │
│  - App Router pages + API routes         │
│  - WebSocket upgrade handler             │
│  - Auth.js (EVE SSO provider)            │
└──────────┬──────────────┬────────────────┘
           │              │
       Postgres        Redis
       (single DB,     (cache + BullMQ)
        2 schemas:
        pathfinder,
        universe)
```

Compose file ships this stack as the supported self-host bundle.

## 6. Data model approach

Source: [02-data-model.md](02-data-model.md).

### 6.1 ORM and DB

- **Drizzle** for schemas, queries, and migrations. The Cortex `$fieldConf` style maps cleanly onto Drizzle's per-column declaration. JSON columns use Postgres `jsonb`.
- **Postgres** single instance, two schemas: `pathfinder` (mutable user data — 38 models) and `universe` (static CCP data — 22 models). Replaces the current dual-MySQL-DSN pattern ([02 § Surface area](02-data-model.md#surface-area)).
- **Cross-schema FKs are native** in Postgres, closing the gap [02 § Cross-DB FKs do not exist](02-data-model.md#cortex-orm-primer) flagged. `pathfinder.system.system_id` → `universe.system.id` becomes a real FK.

### 6.2 Postgres-native wins

- `LISTEN/NOTIFY` for realtime fanout (§5.2) — removes Redis pub/sub as a separate piece.
- `jsonb` for the activity-log payload (currently denormalized TEXT in `activity_log`).
- Partial indexes on `WHERE active = true` — the soft-delete convention ([02 § Cortex ORM primer](02-data-model.md#cortex-orm-primer)) becomes a first-class index strategy.
- `timestamptz` everywhere; drop the implicit-UTC assumption baked into `DATETIME` columns.
- `generated always as identity` columns instead of MySQL `AUTO_INCREMENT`.

### 6.3 Data migration

One-shot MySQL → Postgres export at cutover. Type mapping rules:

| MySQL | Postgres |
|---|---|
| `TINYINT(1)` | `boolean` |
| `DATETIME` | `timestamptz` (interpret as UTC) |
| `VARCHAR(N)` | `varchar(N)` or `text` |
| `TEXT` | `text` |
| `JSON` (rare) | `jsonb` |
| `INT UNSIGNED` | `bigint` (safety; EVE IDs are 64-bit anyway) |
| `AUTO_INCREMENT` | `generated always as identity` |

Tooling: `pgloader` for the bulk move, validated by row counts + per-table checksum comparisons. Captured in a one-shot migration repo, not committed to the app.

### 6.4 Static-data bootstrap

Replace [02 § 21 Bootstrap data files](02-data-model.md#21-bootstrap-data-files) (SQL dump + CSV exports + Pochven/Zarzakh patch SQLs) with:

1. **Streaming SDE ingest** — CCP's official Static Data Export as YAML/SQLite is the source of truth. A scheduled job downloads, diffs, and applies.
2. **ESI deltas** for sov / FW state and structure resolution — same endpoints as today ([05 § 3](05-external-integrations.md#3-ccp-esi-game-data)).

This kills the "patch SQL when CCP adds a region" dance ([10 footgun #4](10-feature-matrix.md#ccp-api-footgun-history)).

## 7. Auth strategy

Source: [05 § 2 CCP SSO](05-external-integrations.md#2-ccp-sso-oauth-20--jwt), [09 § Auth principals](09-permissions-and-admin.md#auth-principals).

- **Auth.js v5** with a custom **EVE SSO** OAuth2 provider implementing CCP's authorize → callback → token-exchange → JWK-verify flow.
- **Persisted refresh tokens** — every token response writes the (possibly rotated) `refresh_token` back to the `character_authentication` row before the new access token is consumed. Closes [10 footgun #2](10-feature-matrix.md#ccp-api-footgun-history).
- **JWK caching** — fetch on cold start, refresh on signature failure, capped at one re-fetch per 10s ([10 footgun #3](10-feature-matrix.md#ccp-api-footgun-history)).
- **Multi-character session** — Auth.js session holds the active character id; switching is a server action that updates the session. Same character ↔ user mapping as [09 § Auth principals](09-permissions-and-admin.md#auth-principals).
- **Admin scopes** — split into a second `eve-admin` provider that requests the (currently empty) `CCP_ESI_SCOPES_ADMIN` scope set ([10 dead-code table](10-feature-matrix.md#dead--disabled--wip-inventory)). A real admin-scope list is decided in §11 Q.
- **"Remember me" cookie migration** — at cutover, the new app reads the legacy selector+validator cookie once, looks up the matching `character_authentication`, re-issues an Auth.js session, and clears the legacy cookie. Window: ≥30 days (matches `COOKIE_EXPIRE`). After window, drop legacy reader.

## 8. Keep / Drop / Redesign

Restated and consolidated from [10 § Hand-off to Stage J](10-feature-matrix.md#hand-off-to-stage-j) and [10 § Dead / disabled / WIP inventory](10-feature-matrix.md#dead--disabled--wip-inventory). This is the authoritative version.

### 8.1 Keep (with no shape change)

Every row in [10 §§ 1–14](10-feature-matrix.md) **not** flagged in §15 or appearing below. Notable: map / system / connection / signature CRUD; access lists; activity log; rally points (webhook-only); zKillboard, EVE-Scout, DOTLAN, GitHub, CCP image deep links; admin panel actions; setup wizard.

### 8.2 Drop

| Item | Where | Rationale |
|---|---|---|
| `Cron\Universe::updateUniverseSystems` | [`app/cron.ini`](../../app/cron.ini) (commented) | Historical WIP, never shipped. |
| Mail rally / history broadcast (`SEND_*_Mail_ENABLED`) | [`app/pathfinder.ini`](../../app/pathfinder.ini) (all scopes default off) | Webhook channels cover the same need; SwiftMailer + Monolog mail handler + `public/templates/mail/` go with it. |
| `DB_CCP_*` DSN block | [`app/environment.ini`](../../app/environment.ini) | No live readers ([10 Q1](10-feature-matrix.md#open-question-audit)). |
| `Lib\Config::pingDomain` | [`app/Lib/Config.php`](../../app/Lib/Config.php) | Appears dead ([10 Q2](10-feature-matrix.md#open-question-audit)); confirm via `git log -S` before deletion. |
| `BaseModule.isPlugin` + `module/empty.js` | `js/app/ui/module/empty.js` | Plugin scaffolding never wired into build. |
| `header_login.js` canvas physics splash | `js/app/ui/header_login.js` (~600 LOC) | Decorative; replace with a static SVG hero. |
| `Position.findNonOverlappingDimensions` `findChain:true` branch | `js/app/map/util.js` | Likely dead ([10 dead-code table](10-feature-matrix.md#dead--disabled--wip-inventory)). |
| MySQL-table session storage | `app/Db/Sql/Mysql/Session.php` | Replaced by stateless JWT cookie or Redis sessions. |
| F3 route bandwidth throttle (`(0, 512)` arg pair) | [`app/routes.ini`](../../app/routes.ini) | Not a real rate limit; replaced by per-route limiter. |
| RequireJS, Gulp, jQuery, jsPlumb runtime, DataTables, Summernote, PNotify | `js/app/**`, [`gulpfile.js`](../../gulpfile.js) | Replaced wholesale by the Next.js / React stack. |

### 8.3 Redesign

| Subsystem | Current | Rebuild |
|---|---|---|
| Realtime transport | `react/socket` + `clue/ndjson-react` in a separate optional repo, silently no-ops if absent | Native WebSocket in the same deployment; Postgres `LISTEN/NOTIFY` fanout when multi-instance. §5.2 |
| Static-data sync | SQL dump in `export/sql/eve_universe.sql.zip` + ESI walk + patch SQLs for Pochven/Zarzakh | Streaming SDE + ESI deltas. §6.4 |
| Auth + refresh-token rotation | Bespoke `Sso::verifyAccessToken`; refresh tokens not persisted on rotation | Auth.js v5 + EVE provider; refresh persisted on every rotation. §7 |
| Auth cookies ("Remember me") | Selector+validator pair, undocumented on-wire format | Auth.js session cookie; legacy selector read once during migration window. §7 |
| Static config | Six `.ini` files (`config`, `environment`, `pathfinder`, `plugin`, `requirements`, `cron`) | Env vars + a `pathfinder.config.ts` for type-safe app constants. Drop `requirements.ini` (Node version pinned in `package.json`). |
| Map history storage | NDJSON files under `history/`, truncated by cron, leaked on hard-delete | Append-only Postgres table partitioned by month; bound to map lifecycle via FK. Closes the file-leak bug. |
| Sessions | MySQL-backed in PF DB | Stateless JWT or Redis. |
| Map engine | jsPlumb + 3,441-LOC `map.js` | React component; jsPlumb-React-wrapper vs `react-flow` decided in Phase 1 prototype. §5.4 |
| Build pipeline | Gulp 4 on Node 12 EOL | Next.js native build (Turbopack). |

### 8.4 Decide before commit

- `CCP_ESI_SCOPES_ADMIN` — empty in shipped config. Either populate with a real admin-scope set or drop the admin-scope gate from §7. ([09 Q on admin scopes](09-permissions-and-admin.md#open-questions))
- `[PATHFINDER.EXPERIMENTS] PERSISTENT_DB_CONNECTIONS` — re-evaluate against Postgres pooling (PgBouncer or built-in `pg`).

## 9. Phased migration

Each phase ends in a parity gate (§10). The legacy app stays serving production until Phase 5.

### Phase 0 — Static-data parity (1–2 weeks)

- Stand up Postgres + `universe` schema.
- Implement SDE ingest job. Backfill from latest CCP SDE.
- Smoke test: route lookup (`system_neighbour` equivalent) returns identical results to the legacy `eve_universe` DB for a sample of N system pairs.
- **Gate:** `universe.*` row counts within 0.5% of legacy `eve_universe.*` row counts for static tables; spot-check 100 random systems.

### Phase 1 — Auth + read-only map (3–4 weeks)

- Auth.js EVE provider with refresh-token rotation.
- App Router pages for login + map list + map view (read-only).
- Server reads from a **legacy DB read-replica** for `pathfinder.*` so no schema migration is needed yet.
- Map engine prototype in both candidate stacks (jsPlumb-wrapper, `react-flow`); pick a winner.
- **Gate:** a logged-in character sees their maps with all systems and connections rendered, kill stats and route module populated, no edit affordances.

### Phase 2 — Map writes + realtime (4–6 weeks)

- Drizzle schema for `pathfinder.*`; one-shot import via `pgloader` to a staging DB.
- All map / system / connection / signature mutation endpoints behind a feature flag.
- WebSocket transport with full task vocabulary (§5.2) and SharedWorker on the client.
- Activity log + map history (now table-based, not file).
- **Gate:** [10 §§ 2–6](10-feature-matrix.md) green; two pilot corps run real ops on the new app for one EVE downtime cycle.

### Phase 3 — Cron + integrations (3–4 weeks)

- BullMQ port of all 13 jobs.
- ESI client with circuit breakers; SSO refresh-token persistence verified by integration test.
- zKillboard, EVE-Scout, GitHub, Slack, Discord clients.
- Structure resolution + intel modules.
- **Gate:** [10 §§ 7, 9, 11](10-feature-matrix.md) green; all cron jobs report success for one full week.

### Phase 4 — Admin + parity gate (2–3 weeks)

- Admin panel: maps, members, notification config, global settings.
- Kick / ban / activate / hard-delete actions (CSRF-safe; no GET mutations).
- Setup wizard.
- **Gate:** Every row in [10 §§ 1–14](10-feature-matrix.md) not in §8.2 has a working implementation. Open-question list (§11) is closed except for "decide later" items.

### Phase 5 — Cutover (1 week)

- Final MySQL → Postgres migration of `pathfinder.*` (cutover window).
- DNS / proxy flip; legacy app becomes read-only export-only mode.
- "Remember me" cookie migration window starts (30 days, §7).
- **Gate:** No P1 bugs for 7 consecutive days post-cutover.

## 10. Feature-parity gates

| Phase | Matrix sections that must be green |
|---|---|
| 0 | — (infra only) |
| 1 | §§ 1, 3 (read-only), 9 (CCP SSO only) |
| 2 | §§ 2, 3, 4, 5, 6, 12, 13 |
| 3 | §§ 7, 9 (all), 11 |
| 4 | §§ 8, 10, 14 |
| 5 | Full matrix; no row marked ⛔ or ⚠ in the parity tracker |

"Green" = the rebuild produces the same observable outcome as the legacy app for that feature, plus passes the relevant tests in the new repo's E2E suite.

## 11. Open questions before commit

Verbatim from [10 § Open-question audit](10-feature-matrix.md#open-question-audit). All must be resolved before the rebuild commits to a final shape in the indicated area.

1. **`DB_CCP_*` env block** — confirmed unused; remove rather than carry forward. *(Decision: drop, §8.2.)*
2. **`Lib\Config::pingDomain`** — appears dead; confirm with `git log -S` before deletion.
3. **WebSocket `subscribe` / `stats` / `healthCheck` payload shapes** ([04 Q2–Q4](04-cron-and-background.md#open-questions)) — must be lifted from `KitchenSinkhole/pathfinder_websocket` before §5.2 is finalized. **Blocking for §5.2.**
4. **`refreshAccessToken` rotation** ([05 Q3](05-external-integrations.md#open-questions)) — current code does not persist a rotated `esiRefreshToken`. High-priority latent bug; rebuild fixes by §7, but document the legacy gap so any prod hotfix lands first.
5. **`searchUniverseNameData` scope coverage** ([05 Q2](05-external-integrations.md#open-questions)) — only `search_structures` scope is granted; non-structure categories may be queried silently.
6. **Vendor opKey ↔ swagger op mapping** ([05 Q1](05-external-integrations.md#open-questions)) — diff against `KitchenSinkhole/pathfinder_esi` before TS ESI client. **Blocking for §5 ESI client.**
7. **Map history file purge** ([04 Q6](04-cron-and-background.md#open-questions)) — confirmed leak; rebuild closes by §8.3, but a one-shot cleanup script for existing leaked files is needed at cutover.
8. **`map_share` / `map_import` / `map_export` server-side enforcement** ([09 Q1](09-permissions-and-admin.md#open-questions)) — server-side check needs verification per controller; potential bypass on current app. Rebuild adds explicit per-action right checks.
9. **Cookie `SameSite` / `Secure` flags** ([09 Q6](09-permissions-and-admin.md#open-questions)) — no-CSRF posture currently depends on proxy-set flags. Rebuild sets these in app code.
10. **Kick / ban orphaning on account delete** ([09 Q7](09-permissions-and-admin.md#open-questions)) — current orphan behavior unspecified; pick a rule (cascade vs preserve) before §4 admin work in Phase 4.
11. **Activity-log retention week-rollover** ([04 Q7](04-cron-and-background.md#open-questions)) — minor; rebuild uses month partitions and avoids the ISO53 corner case entirely.

## 12. Cross-doc index

| When you are implementing… | Read first |
|---|---|
| Anything | [00 — Overview](00-overview.md), [10 — Feature Matrix](10-feature-matrix.md) |
| Config / env / deployment topology | [01 — Configuration & Deployment](01-config-and-deployment.md) |
| Drizzle schema, DB migration, data types | [02 — Data Model](02-data-model.md) |
| API route shape, request lifecycle, auth gating per endpoint | [03 — Backend HTTP API](03-backend-api.md) |
| BullMQ job port, WebSocket transport, map history | [04 — Cron & Background Workers](04-cron-and-background.md) |
| Auth.js EVE provider, ESI client, Slack/Discord/GitHub | [05 — External Integrations](05-external-integrations.md) |
| Page chrome, SharedWorker, init bootstrap, build replacement | [06 — Frontend Architecture & Build](06-frontend-architecture.md) |
| Map engine port (highest-risk slice) | [07 — Frontend Map Engine](07-frontend-map-engine.md) |
| Dialogs, modules, form widgets, notifications | [08 — Frontend UI Modules & Dialogs](08-frontend-ui-modules.md) |
| Roles, rights, character status, admin gating | [09 — Permissions & Admin](09-permissions-and-admin.md) |

---

## Self-check (Stage J)

- [x] Every row in [10 §§ 1–14](10-feature-matrix.md) appears in §3 (Functional requirements) or §8.2 (Drop).
- [x] Every entry in [10 § Dead / disabled / WIP inventory](10-feature-matrix.md#dead--disabled--wip-inventory) appears in §8.2 or §8.3.
- [x] All 11 blocking open questions from [10 § Open-question audit](10-feature-matrix.md#open-question-audit) appear in §11.
- [x] Every Stage A–I doc is linked at least once (see §12 cross-doc index and inline citations).
- [x] No new behavior prose — Stage J cites the source doc rather than re-deriving.

## Hand-off

This document closes doc-plan.md Stage 1 (documentation). Stage 2 (rebuild) starts with **Phase 0** per §9 — stand up Postgres, write the SDE ingest job, validate static-data parity. The blocking open questions in §11 (specifically Q3 and Q6) should be answered in that same window, since they constrain the ESI client and WebSocket transport written in Phases 1–3.
