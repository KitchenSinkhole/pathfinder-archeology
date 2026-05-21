# Pathfinder — Rebuild Specification

**Stage J output.** This is the assembly document for the rebuild. It does **not** restate behavior — it points at the behavior-level spec (Stages A–I) and adds the forward-looking decisions on top.

If you are about to write code, start here, then drill into the linked source doc for the layer you are implementing.

---

## 1. Purpose & scope

Pathfinder is a collaborative wormhole-mapping web app for EVE Online ([00 § Purpose](00-overview.md)). The current implementation — Fat-Free Framework + RequireJS/jQuery/jsPlumb + dual MySQL — has been documented in full at the behavior level across nine spec files totalling ~5,000 lines. This document converts that present-state spec into a rebuild blueprint on **Next.js + TypeScript + Drizzle + Postgres** (no Redis — see §5).

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
| Caching | [10 § 12](10-feature-matrix.md#12-caching) | In-process LRU for universe lookups and search index; no separate cache service (§5.5). |
| UI shell & ergonomics | [10 § 13](10-feature-matrix.md#13-ui-shell--ergonomics), [06 § Page chrome](06-frontend-architecture.md#page-chrome-jsapppagejs), [08](08-frontend-ui-modules.md) | Header, footer, splash, status pages, module dock, shortcuts, gallery, task manager. |
| Build & assets | [10 § 14](10-feature-matrix.md#14-build--assets), [06 § Build pipeline](06-frontend-architecture.md#build-pipeline) | Replaced wholesale by Next.js build (§5). |

Every dialog and module listed under [08 § Module / dialog inventory](08-frontend-ui-modules.md#module--dialog-inventory) and [10 §§ 1–14](10-feature-matrix.md) is in scope unless dropped in §8.

## 4. Non-functional requirements

| NFR | Source / rationale | Acceptance |
|---|---|---|
| Self-host complexity | [00 Q answer](00-overview.md#open-questions) | One `docker-compose.yml` brings up the app and Postgres. No Redis, no separate socket-server repo. |
| Realtime liveness | [04 § Known issues](04-cron-and-background.md#known-issues--quirks) (silent no-op) | If realtime is unhealthy, the UI must surface a degraded-mode banner — never silently render stale state. |
| ESI failure modes | [05 § 3 CCP ESI](05-external-integrations.md#3-ccp-esi-game-data), [00 § Known issues](00-overview.md#known-issues--quirks-high-level) | Per-endpoint circuit breakers; downtime window (`±8m` around `CCP_SSO_DOWNTIME`) treated as expected. ESI shape drift survives via Zod-validated response decoders. |
| Refresh-token rotation | [10 footgun #2](10-feature-matrix.md#ccp-api-footgun-history) (high-priority bug) | Rotated `refresh_token` from every SSO response is persisted to `character_authentication` before the new access token is used. Verified by integration test. |
| Authoritative session storage | [00 § Known issues](00-overview.md#known-issues--quirks-high-level) (MySQL sessions) | Stateless JWT cookie. No DB-table session store, no Redis. |
| Background jobs | [04 § Job inventory](04-cron-and-background.md#job-inventory) | Same job outcomes as the legacy 13, run on a Postgres-backed queue (§5.3). Must be observable (job duration, failure count). |
| Map history file leak | [10 footgun "history file purge"](10-feature-matrix.md#dead--disabled--wip-inventory) | History storage is bound to map lifetime — hard-deleting a map must cascade. |
| Static-data drift | [10 footgun #4](10-feature-matrix.md#ccp-api-footgun-history) (Pochven/Zarzakh) | Static-data refresh is driven by streaming SDE + ESI deltas, not patch SQL files. Adding a new region/system requires zero schema work. |
| Throughput | Not measured in present-state docs | Out of scope to specify a number; rebuild should preserve responsiveness on a single small VPS (current deploy target). Capture baselines during Phase 0. |
| Auth-cookie compatibility | [10 footgun #7](10-feature-matrix.md#ccp-api-footgun-history) | A migration window where the new app reads legacy selector+validator cookies once, re-issues a new format, and discards. |

## 5. Target architecture

**Stack:** Next.js 16+ (App Router) · React 19 · TypeScript 6+ · Drizzle ORM · Postgres 18 · Auth.js v5 · Node 24 LTS. No Redis — sessions are stateless JWT, the background queue is Postgres-backed (§5.3), realtime fanout is `LISTEN/NOTIFY` (§5.2), and hot caches are in-process LRU (§6.2).

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

**Mutation pathways.** The rebuild distinguishes three, each with a single canonical mechanism:

| Trigger | Mechanism | Examples |
|---|---|---|
| User clicked / typed in the UI | Server Action *or* JSON API route | Account settings save, map create / delete, signature paste, drag system, edit connection type |
| Server observed something external | Background job (§5.3) → DB write → `map_event` insert → `pg_notify` → WS push | **Character location change (hot path)**, EOL connection expiry, signature decay, ESI killboard delta, structure resolution |
| Cross-tab fan-out of either above | WebSocket server → client only | All `mapUpdate` / `characterUpdate` / `mapConnectionAccess` envelopes |

The WebSocket is a **broadcast** channel, not a request channel — clients do not send mutations over it. Every mutation regardless of origin lands as one `INSERT INTO map_event` (§6.5), an `AFTER INSERT` trigger does `pg_notify('map:'||map_id, ...)`, and the WS handler picks it up. One canonical commit point per change.

Server Actions are used for low-traffic state changes where a fresh page render is the natural next step (account settings, map create / delete, admin settings). JSON API routes serve high-frequency client-initiated mutations (signature edits, system drag, connection type change). The full set of legacy "AJAX API (26 actions)" endpoints should be re-enumerated in Phase 1 before porting — once character tracking moves server-side (§5.3) and `map_event` drives fan-out, several legacy endpoints become unnecessary.

### 5.2 Realtime transport

Replace `react/socket` + `clue/ndjson-react` + the external `KitchenSinkhole/pathfinder_websocket` process with **native WebSockets served by the same Next.js deployment**.

Approach:
- **Node runtime WebSocket route** in the same Next.js deployment. The supported topology is long-running Node, not serverless — this matches the self-host target (§4 NFR).
- **Postgres `LISTEN/NOTIFY`** for fanout between server instances when scaling beyond a single Node process. The same channel that the `map_event` trigger publishes to (§6.5) is the channel the WS handler subscribes to. No Redis pub/sub.
- **Broadcast direction only.** Clients subscribe and receive; they do not mutate over the WS. All mutations land via the pathways in §5.1.
- **Task vocabulary** inherited verbatim from [04 § Realtime transport coverage](10-feature-matrix.md#realtime-transport-coverage-stage-d) — `mapUpdate`, `mapAccess`, `mapConnectionAccess`, `mapDeleted`, `characterUpdate`, `characterLogout`, `healthCheck`, `logData`, `subscribe`, `unsubscribe`. Payload shapes are a Phase-0 deliverable (§11).

The browser side keeps the **SharedWorker** pattern from [06 § SharedWorker + WebSocket transport](06-frontend-architecture.md#sharedworker--websocket-transport) so a character with multiple tabs holds exactly one socket. SharedWorker is well-supported in current Chromium / Firefox; Safari gap is acceptable (matches current product support).

### 5.3 Background jobs

The jobs from [04 § Job inventory](04-cron-and-background.md#job-inventory) are reimplemented as a single Node job runner backed by **Postgres**: `graphile-worker` is the recommended library (`pgmq` or `river` are equivalents). `LISTEN/NOTIFY` drives low-latency dispatch on the same channel the realtime fanout uses (§5.2). No Redis. Disabled jobs (`updateUniverseSystems`, `Cron\Universe::setup`) are dropped — `setup` becomes a one-shot CLI command per §8.

**Character location tracking is the hottest job and is moved fully server-side.** The legacy app drives ESI location polling from a client poll loop (`/api/Map/updateData`), coupling tracking to a tab being open and multiplying ESI calls by tab count. The rebuild runs one location-poll job per tracked character regardless of client state. On a non-gate-adjacent location change (lookup against `universe_stargate`), the job upserts both systems onto the map and creates an assumed wormhole connection — the canonical example of the server-initiated mutation pathway in §5.1.

Polling cadence is adaptive on character `online` state: faster while online, slower while offline. Both intervals are **hard-coded constants** (e.g. `LOCATION_POLL_ONLINE_MS`, `LOCATION_POLL_OFFLINE_MS`) tuned during development and frozen before ship — no `pathfinder.ini` knob.

Per-request "background" work ([04 § Per-request background work](04-cron-and-background.md#per-request-background-work)) — the activity-log buffer flush in `Controller::unload` — moves to an `after()` hook on Server Actions or a flush-on-response wrapper for API routes. With `map_event` (§6.5) as the unified audit shape, this collapses into a single insert per request.

### 5.4 Frontend

- **Page chrome** ([06 § Page chrome](06-frontend-architecture.md#page-chrome-jsapppagejs)) — React components; off-canvas Slidebars replaced with shadcn/ui `Sheet`.
- **Dialogs** ([08 § Per-dialog specs](08-frontend-ui-modules.md#per-dialog-specs)) — 13 dialogs become route-modal `parallel` slots or `<Dialog>` components.
- **Modules** ([08 § Per-module specs](08-frontend-ui-modules.md#per-module-specs)) — 13 modules become React components inside the map page shell; tabs / docking via a grid layout primitive (CSS grid + Framer Motion or `react-grid-layout`).
- **Map engine** ([07](07-frontend-map-engine.md)) — **the single highest-risk slice.** jsPlumb + 3,441 LOC of `map.js` are re-authored on **`react-flow` (xyflow)**. jsPlumb community edition is unmaintained relative to xyflow, and a jsPlumb-in-React wrapper would leak imperative state through every component boundary. The magnetize / overlay / drag-select features ([07 § Auxiliary modules](07-frontend-map-engine.md#auxiliary-modules)) are a finite list — most map onto xyflow plugins or composable hooks. Re-authoring is real Phase-1 cost but pays back across Phases 2–5; the legacy `map.js` listing is not used as a reference implementation beyond behavior cues.
- **DataTables / Summernote / PNotify** — replaced by TanStack Table, Tiptap, and sonner (or shadcn `Sonner`) respectively.

### 5.5 Deployment topology

```
┌──────────────────────────────────────────┐
│ Next.js (Node runtime)                   │
│  - App Router pages + API routes         │
│  - WebSocket upgrade handler             │
│  - Auth.js (EVE SSO provider)            │
│  - graphile-worker (background jobs)     │
│  - In-process LRU (universe lookups)     │
└──────────────────┬───────────────────────┘
                   │
               Postgres
               (single DB, single schema;
                LISTEN/NOTIFY drives both
                realtime fanout and job dispatch)
```

Compose file ships this two-service stack as the supported self-host bundle. If a deployment ever scales beyond one Node instance, a managed Redis can be introduced for a fairness-aware queue (BullMQ) — out of scope for the rebuild's supported topology.

## 6. Data model approach

Source: [02-data-model.md](02-data-model.md).

### 6.1 ORM, DB, and naming conventions

- **Drizzle** for schemas, queries, and migrations. The Cortex `$fieldConf` style maps cleanly onto Drizzle's per-column declaration. JSON columns use Postgres `jsonb`.
- **Postgres**, single instance, **single schema** (the historical `pathfinder` / `universe` split exists only because MySQL cannot FK across DSNs — that constraint is gone).
- **Table-name prefixes are mandatory, no exceptions:** every user-data table starts with `pf_`, every static CCP-data table starts with `universe_`. This avoids the legacy ambiguity where two `system` tables existed in different schemas.
- **Column casing:** `snake_case` in the database; TS-side surfaces use `camelCase` via Drizzle's `name:` mapping. Pick one and stick to it.
- **All time columns are `timestamptz`.** No naked `timestamp`, no MySQL-style implicit-UTC `DATETIME`.
- `pf_map_system.system_id` → `universe_system.id` is a real FK with `ON DELETE RESTRICT`. All cross-domain joins are native; no schema-name gymnastics, no application-level loader for what should be a SQL join.

### 6.2 Postgres-native wins

- `LISTEN/NOTIFY` for realtime fanout (§5.2) and job dispatch (§5.3) — one mechanism, no Redis.
- `jsonb` for the unified audit-event payload (`map_event.payload`, §6.5).
- `pgEnum` (Drizzle) or native `CREATE TYPE` for tiny lookup tables (`map_type`, `map_scope`, `system_type`, `system_status`, `character_status`, `connection_scope`) — six tables of ~24 total rows collapse into six enums and the joins disappear. Cortex needed lookup tables only because it had no enum primitive.
- `timestamptz` everywhere; drop the implicit-UTC assumption baked into `DATETIME` columns.
- `generated always as identity` columns instead of MySQL `AUTO_INCREMENT`.
- Materialized views for the weekly activity rollup (§6.5), refreshed hourly.

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

**Stargate adjacency as a real edge table.** Legacy `system_neighbour` stores neighbours as a pipe-delimited `VARCHAR512` ([02 § 19.1](02-data-model.md#191-systemneighbourmodel--system_neighbour) — known smell). Replace with a proper directed edge table:

```
universe_stargate_edge (
  from_system_id int → universe_system.id ON DELETE CASCADE,
  to_system_id   int → universe_system.id ON DELETE CASCADE,
  PRIMARY KEY (from_system_id, to_system_id)
)
CREATE INDEX ON universe_stargate_edge (to_system_id);
```

Server-side character-location tracking (§5.3) looks up gate-adjacency directly via PK. Route planning uses a Postgres recursive CTE or in-app BFS. SDE delta becomes plain `INSERT` / `DELETE` rows — no whole-table rebuild, no string parsing. The denormalized `regionId` / `constellationId` / `trueSec` columns from `system_neighbour` are dropped (they already live on `universe_system`).

**Wormhole dogma overrides as a DB table.** Legacy patches the (often-missing) ESI dogma attribute 3974 via the side-channel `export/csv/wormhole.csv` ([02 § 17.3](02-data-model.md#173-typemodel--type), [02 § 21](02-data-model.md#21-bootstrap-data-files)). Replace with:

```
universe_type_override (
  type_id    int → universe_type.id ON DELETE CASCADE,
  attr_id    int,
  value      double precision NOT NULL,
  reason     text,                          -- 'esi-missing-3974' | 'admin' | 'sde-correction'
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (type_id, attr_id)
)
```

Effective dogma value is read via a view: `universe_type_attribute_effective` returns `COALESCE(override.value, type_attribute.value)`. `wormhole.csv` is a one-shot install-time bootstrap into this table — admin-editable thereafter, survives every SDE refresh.

### 6.5 Lifecycle, visibility, and audit

The legacy schema uses a generic `active` boolean across `map`, `system`, `connection`, `signature`, etc. ([02 § Cortex ORM primer](02-data-model.md#cortex-orm-primer)) for three distinct behaviors: system resurrection on re-encounter, two-phase map deletion, and admin disable-without-delete. The rebuild replaces the generic flag with mechanisms that fit each case.

**Map root (`pf_map`).** The owning entity for every per-map relation below. Two-phase lifecycle via `deleted_at`.

```
pf_map (
  id                         bigserial PRIMARY KEY,
  scope                      map_scope NOT NULL,    -- enum: wh | k_space | none | all
  type                       map_type  NOT NULL,    -- enum: private | corp | alliance
  name                       text NOT NULL,
  icon                       text,
  delete_expired_connections boolean NOT NULL DEFAULT true,
  delete_eol_connections     boolean NOT NULL DEFAULT true,
  track_abyssal_jumps        boolean NOT NULL DEFAULT true,
  log_activity               boolean NOT NULL DEFAULT true,
  next_bookmarks             jsonb   NOT NULL DEFAULT '[]'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  deleted_at                 timestamptz   -- two-phase; deleteMapData cron purges after 30-day grace
)
```

Legacy toggles dropped under the new lifecycle: `persistentAliases` and `persistentSignatures` are obsolete (`pf_map_system` rows always persist across invisibility cycles, and `pf_map_signature` reaps independently by `expires_at`); `logHistory` is obsolete (`pf_map_event` is the universal log — see below).

**Map-system visibility.** The universe is finite (~10.5K systems) and per-map row count is bounded by `MAX_SYSTEMS`. `pf_map_system` rows persist for the life of their parent map; an explicit `visible boolean` controls whether the system currently appears on the map:

```
pf_map_system (
  id               bigserial PRIMARY KEY,
  map_id           fk → pf_map.id              ON DELETE CASCADE,
  system_id        int  → universe_system.id,  -- real FK, finite universe
  visible          boolean NOT NULL,
  position_x       double precision NOT NULL DEFAULT 0,  -- float; legacy 2440×1480 clamp dropped (xyflow renders float)
  position_y       double precision NOT NULL DEFAULT 0,
  alias            text,                       -- user-set system label
  tag              text,                       -- single short chain-position tag (e.g. "A1")
  status           system_status NOT NULL DEFAULT 'unknown',  -- enum: unknown | friendly | occupied | hostile | empty | unscanned
  intel_notes      text,
  locked           boolean NOT NULL DEFAULT false,
  rally_at         timestamptz,                -- non-null ⇒ rally active; replaces legacy rallyUpdated + rallyPoke
  first_added_at   timestamptz NOT NULL DEFAULT now(),
  last_visible_at  timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, system_id)
)
```

**Map connections.** Edges between two map-systems. The legacy `connection.type JSON` flag bag (~12 token strings with no DB-level mutual-exclusion enforcement — `wh_fresh + wh_critical` was silently accepted) is split into typed columns + enums.

```
pf_map_connection (
  id                    bigserial PRIMARY KEY,
  map_id                fk → pf_map.id           ON DELETE CASCADE,
  source_map_system_id  fk → pf_map_system.id    ON DELETE CASCADE,
  target_map_system_id  fk → pf_map_system.id    ON DELETE CASCADE,
  scope                 connection_scope NOT NULL,  -- enum: wh | stargate | jumpbridge | abyssal
  mass_status           wh_mass NOT NULL DEFAULT 'fresh',  -- enum: fresh | reduced | critical
  jump_mass_class       wh_jump_mass,                       -- enum: s | m | l | xl   (nullable for non-wh)
  is_eol                boolean NOT NULL DEFAULT false,
  is_frigate            boolean NOT NULL DEFAULT false,
  preserve_mass         boolean NOT NULL DEFAULT false,
  is_rolling            boolean NOT NULL DEFAULT false,
  eol_at                timestamptz,            -- when is_eol first flipped to true
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (source_map_system_id <> target_map_system_id)
)
```

The legacy `sourceEndpointType` / `targetEndpointType` JSON columns are dropped — they encoded jsPlumb anchor descriptions; xyflow handles edge endpoints client-side.

**Signatures.** Attached to a map-system, optionally linked to a connection ("this sig IS the wormhole I just bookmarked"). Signature `group`/`type` reference universe lookups, not free text.

```
pf_map_signature (
  id                  bigserial PRIMARY KEY,
  map_system_id       fk → pf_map_system.id        ON DELETE CASCADE,
  map_connection_id   fk → pf_map_connection.id    ON DELETE CASCADE,  -- nullable; sig dies with the WH if linked
  sig_id              text NOT NULL,               -- in-game 3-char sig id (e.g. "ABC")
  group_id            int  → universe_group.id ON DELETE SET NULL,
  type_id             int  → universe_type.id  ON DELETE SET NULL,
  name                text,
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,        -- default created_at + interval '5 days' (EVE max sig lifetime)
  UNIQUE (map_system_id, sig_id)
)
```

Lifecycle rules:

- Removing a system from the map sets `visible = false, last_visible_at = now()`. No row is deleted; intel notes, tags, status, and unattached signatures persist untouched.
- Re-adding the same system (common: same wormhole chain re-scanned hours or a day later) upserts `visible = true` with the new position. Everything still attached reappears.
- `MAX_SYSTEMS` enforcement counts `WHERE visible = true`.
- `pf_map_system` rows are hard-deleted only via `ON DELETE CASCADE` from `pf_map`. Optional housekeeping: garbage-collect rows with `visible = false AND last_visible_at < now() - interval '90 days'` that have no surviving signatures. No cron required for correctness.
- Signature reap cron: `DELETE FROM pf_map_signature WHERE expires_at < now()`. Replaces the legacy `deleteSignatures` job.
- **Connections are hard-deleted on collapse** — wormholes physically die and don't come back. Signatures linked via `map_connection_id` cascade with them. Sigs unattached to a connection (gas, ore, data, relic) survive the system's invisibility cycle. History of every connection mutation is preserved in `pf_map_event` (below).

**Admin disable flags** (corp rights, external-role assignments, etc.) use status enums where actually needed; everything else is hard-delete.

**Character status.** Legacy `kicked` and `banned` are two nullable timestamps encoding mutually-exclusive states. Collapse onto `pf_character`:

```
pf_character.status               character_status NOT NULL DEFAULT 'active'  -- enum: active | kicked | banned
pf_character.status_changed_at    timestamptz
pf_character.status_reason        text
```

**Webhook fan-out (`pf_map_webhook`).** Legacy stores eight denormalized webhook columns on `map` (`slackWebHookURL`, `slackUsername`, `slackIcon`, `slackChannelHistory`, `slackChannelRally`, `discordUsername`, `discordWebHookURLRally`, `discordWebHookURLHistory`). Normalize:

```
pf_map_webhook (
  id           bigserial PRIMARY KEY,
  map_id       fk → pf_map.id ON DELETE CASCADE,
  channel      channel_kind   NOT NULL,    -- enum: slack | discord
  event        webhook_event  NOT NULL,    -- enum: rally | history
  url          text NOT NULL,
  display_name text,
  icon         text,
  UNIQUE (map_id, channel, event)
)
```

Adding a new channel/event = one row, no DDL.

**Permissions: in-app authority + external role tags.** Legacy splits permissions across three tables (`role`, `right`, `corporation_right`) and has no concept of external (e.g. Discord-sync) roles. The rebuild separates two orthogonal concerns:

1. **In-app authority level** — a fixed enum on `pf_character`. Replaces the legacy `role` lookup table entirely.

   ```
   pf_character.authz_level  authz_level NOT NULL DEFAULT 'member'  -- enum: member | manager | admin
   ```

2. **Per-corporation right matrix** — flattened against `authz_level`. Replaces the three-way `corporation_right(corp, role, right)` join with a two-column key.

   ```
   pf_corporation_right (
     corporation_id   fk → pf_corporation.id ON DELETE CASCADE,
     "right"          map_right   NOT NULL,    -- enum: map_create | map_update | map_delete | map_import | map_export | map_share
     min_authz_level  authz_level NOT NULL,
     PRIMARY KEY (corporation_id, "right")
   )
   ```

3. **External / tag-style roles** — supports multi-role-per-character and per-role map visibility (e.g. Discord-sync gives an "Officer" role, certain maps are visible only to Officer-tagged characters). New in the rebuild.

   ```
   pf_role (
     id             bigserial PRIMARY KEY,
     source         role_source NOT NULL,         -- enum: builtin | discord | external
     external_ref   text,                         -- discord role id, auth-system role id, …
     name           text NOT NULL,
     display_label  text,
     UNIQUE (source, external_ref)
   )

   pf_character_role (
     character_id fk → pf_character.id ON DELETE CASCADE,
     role_id      fk → pf_role.id      ON DELETE CASCADE,
     granted_at   timestamptz NOT NULL DEFAULT now(),
     granted_by   text,                          -- 'discord-sync@<hash>' | <character_id> | 'admin'
     PRIMARY KEY (character_id, role_id)
   )

   pf_map_role_access (
     map_id  fk → pf_map.id  ON DELETE CASCADE,
     role_id fk → pf_role.id ON DELETE CASCADE,
     PRIMARY KEY (map_id, role_id)
   )
   ```

External-system role sync (Discord, third-party auth) upserts into `pf_role` and replaces the `pf_character_role` set for each character. The feature is intentionally scaffolded now to avoid a later migration.

**Unified audit / history (`pf_map_event`).** The legacy three-layer setup — `activity_log` (weekly counter rows), `connection_log` (per-mutation detail rows), and NDJSON `history/map/*.log` files (which leak on hard-delete, [04 § Known issues](04-cron-and-background.md#known-issues--quirks)) — collapses into one append-only table:

```
pf_map_event (
  id              bigserial PRIMARY KEY,
  map_id          fk → pf_map.id        ON DELETE CASCADE,
  character_id    fk → pf_character.id  ON DELETE SET NULL,  -- audit survives character deletion
  occurred_at     timestamptz NOT NULL,
  kind            text NOT NULL,        -- referenced against pf_event_kind lookup (below)
  payload         jsonb
) PARTITION BY RANGE (occurred_at)        -- monthly partitions via pg_partman

CREATE INDEX ON pf_map_event (map_id, occurred_at DESC);
CREATE INDEX ON pf_map_event (character_id, occurred_at DESC);

pf_event_kind (
  kind     text PRIMARY KEY,             -- 'system.added' | 'connection.create' | 'signature.update' | …
  category text NOT NULL                 -- for admin-UI grouping: 'system' | 'connection' | 'signature' | 'map' | …
)
```

- `ON DELETE SET NULL` on `character_id` fixes the legacy footgun where erasing a character cascade-wiped every map/system/connection/signature row they ever created ([02 § 22 known issue #2](02-data-model.md#22-known-issues--quirks)).
- The `pf_event_kind` lookup gives the admin UI a stable source for category-grouped event filters without app-side hardcoding.
- An `AFTER INSERT` trigger does `pg_notify('map:'||map_id, payload)` — every commit atomically becomes a realtime broadcast (§5.2). No application-level dual-write.
- Weekly activity rollups become a materialized view over `pf_map_event` keyed by `(year, week, character_id, map_id, kind)`, refreshed hourly via `REFRESH MATERIALIZED VIEW CONCURRENTLY` (requires unique index on the key tuple). Replaces `activity_log`.
- Connection mutations are `kind = 'connection.create' | 'connection.update' | …` rows. Replaces `connection_log`.
- The "recent map history" UI reads the last N rows directly. Replaces NDJSON files. The history-leak bug ([10 footgun "history file purge"](10-feature-matrix.md#dead--disabled--wip-inventory)) is structurally impossible — `ON DELETE CASCADE` from `pf_map` removes every event when a map is deleted (Postgres 14+ propagates cascades into all partitions).
- **Retention policy:** monthly partitions kept indefinitely by default; deployments may attach `pg_partman` retention to drop partitions older than N months. The default should ship as "keep all" — small-corp maps generate negligible event volume.

**Per-system stats time series.** Legacy `system_jumps`, `system_kills_ships`, `system_kills_pods`, `system_kills_factions` each hold a 24-column circular buffer (`value1`…`value24` + `lastUpdatedValue`) as a MySQL-era workaround. Replace with one narrow time-series table:

```
pf_system_stats (
  system_id     int → universe_system.id,
  hour_bucket   timestamptz,
  jumps         int NOT NULL DEFAULT 0,
  ship_kills    int NOT NULL DEFAULT 0,
  pod_kills     int NOT NULL DEFAULT 0,
  faction_kills int NOT NULL DEFAULT 0,
  PRIMARY KEY (system_id, hour_bucket)
) PARTITION BY RANGE (hour_bucket)         -- daily partitions; rolloff = drop partition
```

Rolling 24h windows become `WHERE hour_bucket > now() - interval '24 hours'`. Rolloff is `DETACH/DROP PARTITION` instead of `DELETE` — cheaper, no vacuum churn, matches `pf_map_event` partitioning style.

## 7. Auth strategy

Source: [05 § 2 CCP SSO](05-external-integrations.md#2-ccp-sso-oauth-20--jwt), [09 § Auth principals](09-permissions-and-admin.md#auth-principals).

- **Auth.js v5** with a custom **EVE SSO** OAuth2 provider implementing CCP's authorize → callback → token-exchange → JWK-verify flow.
- **ESI token storage on `pf_character`.** Access token, rotated refresh token, expiry, and granted scopes live directly on the character row (matches the legacy `CharacterModel` placement, *not* the legacy `character_authentication` table — which was the cookie selector/token store and is dropped entirely along with "Remember me" at the end of the migration window).

  ```
  pf_character.esi_access_token         text         -- encrypted at rest (pgcrypto or app-layer AEAD)
  pf_character.esi_access_token_expires timestamptz
  pf_character.esi_refresh_token        text         -- encrypted; rotated on every token exchange
  pf_character.esi_scopes               text[]
  ```

- **Persisted refresh-token rotation** — every Auth.js token-endpoint round-trip writes the (possibly rotated) `refresh_token` back to `pf_character.esi_refresh_token` **before** the new access token is consumed by any caller. Closes [10 footgun #2](10-feature-matrix.md#ccp-api-footgun-history); verified by integration test (§9 Phase 3 gate).
- **JWK caching** — fetch on cold start, refresh on signature failure, capped at one re-fetch per 10s ([10 footgun #3](10-feature-matrix.md#ccp-api-footgun-history)).
- **Multi-character session** — Auth.js session holds the active character id; switching is a server action that updates the session. Same character ↔ user mapping as [09 § Auth principals](09-permissions-and-admin.md#auth-principals).
- **Admin gating** — uses the `pf_character.authz_level` enum (§6.5), not a separate Auth.js provider. The legacy `CCP_ESI_SCOPES_ADMIN` config slot is empty and the second-provider concept is dropped. If a concrete admin-scope requirement appears later, add a provider then.
- **"Remember me" cookie migration** — at cutover, the new app reads the legacy selector+validator cookie once, resolves it against a one-shot import of the legacy `character_authentication` rows, re-issues an Auth.js session, and clears the legacy cookie. Window: ≥30 days (matches `COOKIE_EXPIRE`). After window, the legacy reader and the imported rows are dropped — no `character_authentication` table survives in the rebuild schema.

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
| MySQL-table session storage | `app/Db/Sql/Mysql/Session.php` | Replaced by stateless JWT cookie. |
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
| Map history storage | NDJSON files under `history/`, truncated by cron, leaked on hard-delete | `pf_map_event` table partitioned by month, `ON DELETE CASCADE` from `pf_map`, `AFTER INSERT` trigger → `pg_notify`. Subsumes `activity_log` and `connection_log` too. §6.5 |
| Soft-delete pattern | Generic `active` boolean on every operational table; reaped by `deleteMapData` cron | Replaced by explicit `visible` flag on `pf_map_system`, `deleted_at` two-phase lifecycle on `pf_map` only, hard-delete on `pf_map_connection`. §6.5 |
| Per-system stats | 24-column circular buffer (`value1`…`value24`) on `system_jumps`/`system_kills_*` | Narrow time-series `pf_system_stats (system_id, hour_bucket, …)`. §6.5 |
| Sessions | MySQL-backed in PF DB | Stateless JWT. No Redis, no DB session table. |
| Background queue | None (F3-Cron) | `graphile-worker` on Postgres. `LISTEN/NOTIFY` dispatch. No Redis. §5.3 |
| Map engine | jsPlumb + 3,441-LOC `map.js` | Re-authored on `react-flow` (xyflow). §5.4 |
| Build pipeline | Gulp 4 on Node 12 EOL | Next.js 16 native build (Turbopack). |

### 8.4 Decide before commit

- `CCP_ESI_SCOPES_ADMIN` — empty in shipped config. Decision in §7: drop the second-provider concept entirely; use app-level role checks. Revisit only if a real admin-scope appears.
- `[PATHFINDER.EXPERIMENTS] PERSISTENT_DB_CONNECTIONS` — non-decision under Node + `pg`: connection pooling is the default. Dropped from open questions.

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
- Map engine implementation on `react-flow` (xyflow). No prototype phase — decision pre-committed in §5.4.
- **Gate:** a logged-in character sees their maps with all systems and connections rendered, kill stats and route module populated, no edit affordances.

### Phase 2 — Map writes + realtime (4–6 weeks)

- Drizzle schema for `pathfinder.*`; one-shot import via `pgloader` to a staging DB.
- All map / system / connection / signature mutation endpoints behind a feature flag.
- WebSocket transport with full task vocabulary (§5.2) and SharedWorker on the client.
- Activity log + map history (now table-based, not file).
- **Gate:** [10 §§ 2–6](10-feature-matrix.md) green; two pilot corps run real ops on the new app for one EVE downtime cycle.

### Phase 3 — Cron + integrations (3–4 weeks)

- `graphile-worker` port of all jobs (§5.3).
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
3. **WebSocket `subscribe` / `stats` / `healthCheck` payload shapes** ([04 Q2–Q4](04-cron-and-background.md#open-questions)) — lifted from `KitchenSinkhole/pathfinder_websocket`. **Phase-0 deliverable** (constrains §5.2 from the first code commit, not just "before final shape").
4. **`refreshAccessToken` rotation** ([05 Q3](05-external-integrations.md#open-questions)) — current code does not persist a rotated `esiRefreshToken`. High-priority latent bug; rebuild fixes by §7, but document the legacy gap so any prod hotfix lands first.
5. **`searchUniverseNameData` scope coverage** ([05 Q2](05-external-integrations.md#open-questions)) — only `search_structures` scope is granted; non-structure categories may be queried silently.
6. **Vendor opKey ↔ swagger op mapping** ([05 Q1](05-external-integrations.md#open-questions)) — diff against `KitchenSinkhole/pathfinder_esi`. **Phase-0 deliverable** (constrains the TS ESI client written in Phase 1).
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
| `graphile-worker` job port, WebSocket transport, map history | [04 — Cron & Background Workers](04-cron-and-background.md) |
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

This document closes doc-plan.md Stage 1 (documentation). Stage 2 (rebuild) starts with **Phase 0** per §9 — stand up Postgres, write the SDE ingest job, validate static-data parity, and produce the §11 Q3 / Q6 deliverables (WebSocket payload shapes and ESI opKey mapping). Phase 1 cannot start without those.
