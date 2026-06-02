# 03 — Backend HTTP API

**Stage C output.** Documents every HTTP entry point: page routes, AJAX, REST, and SSO redirect surface. Permissions and admin gating get their own doc — see [09-permissions-and-admin.md](09-permissions-and-admin.md). External-system interactions (ESI, CCP SSO OAuth2 flow internals, GitHub, zKillboard, SMTP) are stubbed here and detailed in Stage E. Cron-side effects of API-triggered work go in Stage D.

Cross-references: data model in [02-data-model.md](02-data-model.md); deployment / config in [01-config-and-deployment.md](01-config-and-deployment.md); stack overview in [00-overview.md](00-overview.md).

## Purpose & scope

Pathfinder exposes:

1. **Five top-level page routes** (`/`, `/setup`, `/sso/<action>`, `/map*`, `/admin*`) that return HTML.
2. **AJAX API** under `/api/<Controller>/<Action>[/arg1[/arg2]]` — JSON in / JSON out, 8 controllers, 26 public actions.
3. **REST API** under `/api/rest/<Resource>[/<id>]` — verb-dispatched, 11 resource controllers + abstract base, 30+ resource verbs.
4. One beacon endpoint: `POST /api/Map/updateUnloadData` (page-unload sync via `navigator.sendBeacon`).

All ajax/REST endpoints are `[ajax]` (Fat-Free flag — short-circuits template rendering, expects JSON). All are uncached and rate-limited.

## Routing layer

`app/routes.ini` is intentionally tiny (~26 lines). Almost all dispatch is wildcard-driven by Fat-Free's route table:

```
GET   @setup    /setup                       [sync]  →  Setup->init
GET   @login    /                            [sync]  →  AppController->init
GET   @sso      /sso/@action                 [sync]  →  Ccp\Sso->@action
GET   @map      /map*                        [sync]  →  MapController->init
GET   @admin    /admin*                      [sync]  →  Admin->dispatch
GET|POST       /api/@controller/@action            [ajax]  →  Api\@controller->@action,        0, 512
GET|POST       /api/@controller/@action/@arg1      [ajax]  →  Api\@controller->@action,        0, 512
GET|POST       /api/@controller/@action/@arg1/@arg2 [ajax] →  Api\@controller->@action,        0, 512
POST           /api/Map/updateUnloadData                  →  Api\Map->updateUnloadData,        0, 512
# [maps] section:
               /api/rest/@controller*               [ajax]  →  Api\Rest\@controller,           0, 512
               /api/rest/@controller/@id            [ajax]  →  Api\Rest\@controller,           0, 512
```

The two trailing route args are F3's `($ttl, $kbps)` pair:

- **`0`** — disables F3's per-route response cache for every API call.
- **`512`** — F3 bandwidth throttle in kbps (capped at the framework level). It is **not** a per-IP request limit — there is no application-level rate limiter; abuse mitigation depends on the throttle plus session auth.

### `[sync]` vs `[ajax]`

- `[sync]` — full page render lifecycle, template rendered in `afterRoute`, HTML headers set.
- `[ajax]` — controller writes the body itself (typically via `echo json_encode(...)`), `Content-Type: application/json` is set by `Controller::beforeRoute`, template machinery is skipped.

### REST dispatch convention

For REST routes the wildcard captures the **class** (`@controller`) only — Fat-Free's invoker honors the HTTP method by calling the controller's lowercase verb method (`get`, `post`, `put`, `patch`, `delete`). Each REST class inherits this convention from [`AbstractRestController`](#abstract-rest-controller). The `@id` segment becomes `$params['id']`; for multi-ID operations the controllers split on commas client-side (e.g. `Api/Rest/Connection.php:23`).

## Request lifecycle

```
HTTP request
  → Fat-Free dispatcher applies throttle + ttl args
  → Controller::__construct                       (Pathfinder\Controller\Controller)
  → Controller::beforeRoute   ─────────────────►  initSession (MySQL-backed),
                                                  IP-spoof detect, suspect-session log,
                                                  set Content-Type, set tplResource,
                                                  send maintenance header if configured
  → (AccessController subclass) beforeRoute    ►  AUTH GATE — isLoggedIn(ttl=0);
                                                  on failure logoutCharacter() + return false
  → (Admin) beforeRoute                        ►  getAdminCharacter() — role + scope check
  → action method                              ►  reads $f3->get('GET.*' | 'POST.*'),
                                                  performs work, echoes JSON or sets template
  → Controller::afterRoute                     ►  preload/prefetch headers, optional template render
  → Controller::unload (F3 callback)           ►  LogController flushes activity buffer
                                                  to DB via INSERT DELAYED
```

References: `app/Controller/Controller.php:90-165`, `:817+`; `app/Controller/AccessController.php:23-36`.

## Auth model (summary; see [09-permissions-and-admin.md](09-permissions-and-admin.md))

Controllers form a three-tier hierarchy:

| Base | Auth at `beforeRoute` | Used by |
|---|---|---|
| `Controller` | None — session only | `AppController` (login), `Setup`, `Api\Setup`, `Api\GitHub`, `Api\User`, `Ccp\Sso` |
| `AccessController extends Controller` | Requires a logged-in, valid character. Calls `isLoggedIn(0)`; if status ≠ `OK`, calls `logoutCharacter()` and aborts the route. | `MapController`, `Api\Access`, `Api\Map`, `Api\Statistic`, `Api\System`, `Api\Universe`, and every `Api\Rest\*` controller |
| `Admin extends Controller` | Custom — `getAdminCharacter()` requires `roleId.name ∈ {SUPER, CORPORATION}` plus admin-scope ESI authorization. | `Admin` only |

Inside individual actions, some controllers re-check entity-level access (typically `MapModel::hasAccess($character)` or equivalent on System/Signature/Connection/Structure/Log).

## Error & response conventions

- **Default success shape** for AJAX/REST: a single JSON value (object or array) written to the response body. Most ajax actions wrap output as `{error: [], ... payload ... }`.
- **`error` array**: a list of `{type, message, field?}` objects rather than HTTP status codes. The frontend renders these via pnotify.
- **HTTP status**: 200 in the success path, even for empty results. Many error paths also return 200 with an empty array; auth failure on `AccessController` returns whatever `logoutCharacter()` writes (typically 302 to login or 403). Admin gate failures return 401/403 via SSO error redirect.
- **Captcha-protected actions** in `Api\User` (saveAccount, deleteAccount) throw `ValidationException` / `RegistrationException` on bad captcha, surfaced as a structured `error` entry.
- **Throttling**: F3 applies the kbps cap silently; clients see slow responses but no explicit 429.
- **CSRF**: there is no CSRF token system. Admin GET routes mutate state. Mitigation relies on same-origin cookie scope and session check.

## Page controllers

### `Controller\Setup` — `GET /setup`

One-shot setup wizard. **No auth.** Reads action via `?action=` query param and dispatches to one of the handlers below. Renders `view/setup.html` for diagnostics by default.

| Action param | Handler | Purpose |
|---|---|---|
| (none) | `init` | Render diagnostics page — env vars, PHP version, DB connectivity, Redis status, socket/cron health |
| `createDB` | `createDB($f3, $dbAlias)` | Create MySQL database for alias `PF` or `UNIVERSE` if missing |
| `bootstrapDB` | `bootstrapDB($f3, $dbAlias)` | Create all model tables for given alias — invokes `setup()` on each `Model\*` class |
| `importTable` | `importTable($modelClass)` | Bulk-load JSON/CSV from `app/Data/` into a table |
| `exportTable` | `exportTable($modelClass)` | Serialize a table to JSON in `app/Data/` |
| `fixCols` | inline | Set `$fixColumns = true` for next pass — alters columns to match model |
| `clearFiles` | `clearFiles($path)` | rm-rf a configured path (cache/etc.) |
| `flushRedisDb` | `flushRedisDb(host, port, db)` | `FLUSHDB` |
| `invalidateCookies` | `invalidateCookies($f3)` | Erase every persistent-login cookie from `character_authentication` |

**Critical quirk — disable in production.** `routes.ini:5` carries the comment "IMPORTANT: remove/comment this line after setup/update is finished!". The route has no auth; an unauthenticated visitor with the URL can `bootstrapDB` (truncating data) or `flushRedisDb` (purging caches). `pathfinder.ini` exposes `[PATHFINDER.SETUP] SHOW_SETUP_WARNING=1` which renders a banner on the login page when the setup route is wired up.

### `Controller\AppController` — `GET /`

Renders the login page. **No auth.** Reads persistent-login cookies (via `Controller::getCookieCharacters()`) to populate the SSO tile grid with previously-used characters. `afterroute` clears SSO error state from the session so a failed handoff doesn't stick.

### `Controller\Ccp\Sso` — `GET /sso/@action`

Dispatches to a public method on the SSO controller. Surface-only here; the OAuth2 token exchange flow is documented in Stage E.

| Action | Purpose |
|---|---|
| `requestAuthorization` | Redirect to CCP SSO authorize URL with default ESI scopes |
| `requestAdminAuthorization` | Same, with the admin-only scope set |
| `callbackAuthorization` | OAuth2 callback — exchange code, verify JWT, persist `character_authentication`, redirect to map page |
| `login` | Server-initiated login of an already-known character (cookie path) |
| `refreshAccessToken(string $refreshToken)` | Internal — refresh expired access token |
| `verifyCharacterData(string $accessToken)` | Internal — ESI `/verify` |
| `verifyJwtAccessToken(string $accessToken)` | Internal — JWKS verify |
| `getCharacterData(int $characterId)` | Internal — pull full character data set |

References: `app/Controller/Ccp/Sso.php:55,69,166,303,376,436,456,494`.

### `Controller\MapController` — `GET /map*`

Renders the main map UI. Extends `AccessController`, so the auth gate fires before `init()`. `init()` sets character ID and page title on the template; the map JS bundle pulls all data from AJAX/REST endpoints documented below.

### `Controller\Admin` — `GET /admin*`

See [09-permissions-and-admin.md § Admin panel](09-permissions-and-admin.md#admin-panel) for full dispatch table. Note: state-mutating admin actions (`kick`, `ban`, `delete`, `save`, `activate`) all use **GET** with no CSRF token.

## AJAX API — `/api/<Controller>/<Action>`

Wildcard-dispatched (`Api\@controller->@action`). Controllers and actions:

### `Api\Access` *(AccessController)*

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `search` | GET / POST | `arg1` = type (`character`/`corporation`/`alliance`), `arg2` = search token | `accessData[]` — entries with `active=1 AND shared=1` | read-only | Populates map-access dropdowns |

### `Api\GitHub` *(Controller — no auth)*

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `releases` | GET / POST | — | `{version, releasesData[], error[]}` | calls GitHub API, caches HTML release notes | Markdown → HTML conversion; flow detail → Stage E |

### `Api\Setup` *(Controller — no auth — see warning)*

These power the admin "cron table" UI and the search-index build step. There is **no auth check** at the controller level despite being operational tooling.

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `cronTable` | GET / POST | — | `{error[], jobsData[], html}` | read | HTML rows for cron job table |
| `cronPause` | POST | `job` (name) | `{error[], jobsData[], html}` | sets `isPaused` on the job, persists | |
| `cronExecute` | POST | `job` (name) | `{error[], jobsData[], html}` | runs job synchronously | Subject to PHP `max_execution_time` — may not match CLI runner behavior |
| `buildIndex` | POST | `type, countAll, count, offset` | `{... progress, subCount}` | builds `system_static` / `system_neighbour` tables in chunks; triggers ESI calls via `Ccp\Universe` | Long-running; client polls for progress |
| `clearIndex` | POST | `type` | `{... progress}` | TRUNCATE on index table | |

**Open question:** Setup AJAX has no role gate. Confirm whether deployments rely on web-layer (nginx) IP allowlisting or whether the lack of gating is a known liability — flag for Stage I.

### `Api\Statistic` *(AccessController)*

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `getData` | GET / POST | `period` (weekly/monthly/yearly), `typeId` (2/3/4 = private/corp/alliance), `year`, `week` | `{statistics[], period, typeId, weekCount, yearWeeks, next, prev, start, offset, error[]}` | read activity_log | Respects `LOG_ACTIVITY_ENABLED` flags per map scope. Scoped to caller's corp/alliance membership. |

### `Api\System` *(AccessController)*

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `setDestination` | POST | `destData[]`, `clearOtherWaypoints` (bool), `first` (bool) | `{destData[], error[], clearOtherWaypoints, first}` | ESI `/ui/autopilot/waypoint` | Requires character ESI token |
| `pokeRally` | POST | `systemId`, `pokeDesktop`, `pokeMail`, `pokeSlack`, `pokeDiscord`, `message` | `{}` on success | broadcasts WebSocket; may send mail (SMTP), Slack/Discord webhooks | See Stage E for transports |

### `Api\Universe` *(AccessController)*

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `search` | POST | `arg1` (token), `categories[]` | `universeNameData[]` | ESI search | Requires character token |
| `constellationData` | POST | `arg1` (constellationId) | `{error[], systemsData[]}` | read universe DB | |

### `Api\User` *(Controller — mixed; action-level checks)*

| Action | Method | Auth | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|---|
| `getCookieCharacter` | POST | none | `cookie` (selector) | `{ccpImageServer, error[], character{}}` | read `character_authentication` | Used by login tile grid |
| `getCaptcha` | POST | none | `reason` (`SESSION_CAPTCHA_ACCOUNT_UPDATE` / `_DELETE`) | `{error[], img}` (base64 PNG) | stores captcha key in session | |
| `logout` | POST | session | `deleteCookie` (bool) | HTTP 200, no body | clears `SESSION.USER`, optionally erases cookies | logged to `character_login.log` |
| `openIngameWindow` | POST | session | `targetId` | `{targetId, error[]}` | ESI `/ui/openwindow/*` | |
| `saveAccount` | POST | session + captcha | `formData{name, email, email_confirm, captcha, share, privateSharing, corporationSharing, allianceSharing, character{logLocation, selectLocation}}` | `{error[], userData{}}` | UPDATE `user`, `corporation`, `alliance`, `character` | Throws `ValidationException` / `RegistrationException` |
| `deleteAccount` | POST | session + captcha | `formData{captcha}` | `{error[]}` | hard-delete user + character; logs to `account_delete.log`; subsequently the `deleteAuthenticationData` cron clears tokens | Destructive |

### `Api\Map` *(AccessController)* — the busy one

| Action | Method | Inputs | Output | Side effects | Notes |
|---|---|---|---|---|---|
| `initData` | GET / POST | — | Large `{timer, mapTypes, mapScopes, systemStatus, systemType, connectionScopes, characterStatus, routeSearch, routes, url{}, plugin{}, character{}, slack, discord, structureStatus, wormholes, universeCategories{}, error[]}` | reads many lookup models | Cached ~1 hour; on SSO error in session, also returns + clears `SESSION.SSO_ERROR` |
| `import` | POST | `typeId, mapData[{config, data{systems, connections}}]` | `{error[], warning[]}` | create map + systems + connections, broadcast access via WebSocket | Validates system count vs `[PATHFINDER.MAP] MAX_SYSTEMS` |
| `getAccessData` | GET / POST | — | `{data{id, token, characterData, mapData[]}}` | generates random 32-char token, writes to WebSocket server, waits for ack | Token is the client→socket auth handshake; see Stage D |
| `updateData` | POST | `mapData[], getUserData` (bool) | `{error[], mapData[], userData?}` | conditional UPDATE on `system`, `connection`, `map`; broadcasts changed maps | Tick of the client→server map-sync loop (`UPDATE_SERVER_MAP.DELAY=5000ms`) |
| `updateUnloadData` | POST | `mapData` (raw JSON string) | HTTP 200, no body | same as `updateData` | Beacon endpoint — `navigator.sendBeacon` on tab close. Has its own explicit route line so the body is read raw, not parsed by F3 |
| `updateUserData` | POST | `mapIds[], getMapUserData, mapTracking, systemData, newSystemPositions[]` | `{mapUserData[], system{data, signatures[], sigHistory[], structures[]}, userData, error[]}` | conditional auto-add of systems/connections when `mapTracking=true`; updates `character_log`; detects pod/abyss; broadcasts | Tick of client→server user-data loop (`UPDATE_SERVER_USER_DATA.DELAY=5000ms`); `mapUserData` cached for `timer.update_server_user_data.delay` |
| `getConnectionData` | POST | `mapId, connectionIds[], addData[], filterData[]` | `connectionData[]` | read-only; map-access gated | Optional: signatures, logs |
| `getLogData` | POST | `mapId, offset, limit` | `{query, data[]}` | read-only | `offset=0` cached per `[PATHFINDER.HISTORY] CACHE` |

References: `app/Controller/Api/Map.php` (large file); see also [04-cron-and-background.md](04-cron-and-background.md) (Stage D, pending) for the WebSocket transport and history NDJSON files.

> **Aperture rebuild — location tracking is server-side and per-map.** The legacy `updateUserData` `mapTracking` flag drove location tracking from the open tab: a character was followed only while a tab was looking at a map, on whichever map the tab was last on. The rebuild moves this to a server-side `location-poll` job (one per tracked character, runs whether or not a tab is open) and makes tracking an **explicit per-map selection** stored in `ap_map_character_tracking (map_id, character_id)` — a row means "track this character on this map," and a character may be tracked on many maps at once with a different per-map selection. There is no global per-character tracking flag (an early rebuild `ap_character.tracking_enabled` column was removed once the join table became the single source of truth). The first time an account opens a map, all its **active** characters are seeded onto that map; a per-`(map, account)` marker `ap_map_tracking_seed` records that the seed has run so the auto-add fires exactly once — afterwards the user's exact selection stands, *including an intentional empty set*. The per-map checkboxes live in the header Characters panel (`setCharacterTrackingAction` / `getMapTrackingAction`). See `src/lib/jobs/tracking.ts` and `docs/plans/per-map-character-tracking.md`.

## REST API — `/api/rest/<Resource>[/<id>]`

### Abstract REST controller

`app/Controller/Api/Rest/AbstractRestController.php`. Extends `AccessController` (so the auth gate fires uniformly). Convention:

- Verb-dispatched: F3 calls `get()`, `post()`, `put()`, `patch()`, or `delete()` on the controller based on `$f3->VERB`.
- `params['id']` carries the trailing `@id` segment. Comma-separated for multi-resource operations.
- GET reads from query string; POST/PUT/PATCH read JSON body. Malformed JSON returns 400.
- Output via `$this->out($data)` — `echo json_encode($data)`.
- Access failures return **empty arrays** rather than 4xx — frontend treats absent payload as "no permission".
- Most mutating verbs end with a WebSocket broadcast of the changed map (`broadcastMap()` inherited from `AccessController`).

### Resource controllers

#### `Connection`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| GET | `params['id']` (comma-sep), `mapId`, `addData[]` (signatures/logs), `filterData[]` | `connectionData[]` (nested sigs/logs optional) | MapModel, ConnectionModel | |
| PUT | JSON `mapId, id, source, target, scope, type, disableAutoScope` | single connection or `[]` on fail | ConnectionModel | `disableAutoScope` opts out of auto type/scope inference |
| DELETE | `params['id']` (comma-sep), JSON `mapId` | `[deletedIds]` | ConnectionModel | |

#### `Log`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| PUT | JSON `connectionId`, log data | `[connection.getData(true,true)]` | ConnectionLogModel | |
| PATCH | `params['id']`, JSON log data | `[connection]` | ConnectionLogModel | |
| DELETE | `params['id']` | `[connection]` or `[]` | ConnectionLogModel | Deactivate (soft) |

#### `Map`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| PUT | JSON full map data | `MapModel.getData()` | MapModel | Create |
| PATCH | `params['id']`, JSON map + `mapCharacters[]`/`mapCorporations[]`/`mapAlliances[]` | `MapModel.getData(true)` or `[]` | MapModel + CharacterModel + CorporationModel + AllianceModel | Type change resets access; respects `MAX_SHARED` per scope; broadcasts mapAccess/mapData |
| DELETE | `params['id']` | `[deletedIds]` or 401 if user lacks corp `map_delete` right | MapModel | Soft-delete; cron `deleteMapData` finishes the job |

#### `Route`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| POST | JSON `routeData[]` (multi search: from/to/mapIds/filters) | `{routesData[{routePossible, routeJumps, route[], error, searchType}]}` | MapModel (per-map access) | ~900-line implementation; layers ESI route API + custom fallback; caches static jumps 1d, dynamic 10s, Thera 1m; depth limited by `[PATHFINDER.ROUTE] SEARCH_DEPTH` |

#### `Signature`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| POST | JSON `systemId, signatures[], deleteOld, deleteConnection` | merged `signatures[]` | SystemSignatureModel | Bulk paste reader path; avoids overwriting unchanged fields |
| PUT | JSON `systemId, signature` | `[signature]` | SystemSignatureModel | Single insert |
| PATCH | `params['id']`, JSON sig | `[sig]` or `[]` | SystemSignatureModel | Changing `groupId` resets `typeId`/`connectionId` |
| DELETE | `params['id']` (comma-sep), JSON `systemId, deleteConnection` | `[deletedIds]` | SystemSignatureModel, ConnectionModel | Cascades to connection delete if requested |

#### `SignatureHistory`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| GET | `params['id']` (systemId) | `[{value: md5(stamp), text}]` | SystemModel | Dropdown values |
| PUT | JSON `systemId, stamp` | `[signatures from snapshot]` | SystemModel, SystemSignatureModel | "Undo" — restores snapshot and logs the action as another history entry |

#### `Structure`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| POST | JSON `[structureData...]` | `{corpId: [structs]}` | StructureModel, CorporationModel | Requires `hasCorporation()`. Bulk paste/sync |
| PUT | JSON structure | `{corpId: [structs]}` | StructureModel | Looks up by `id` or by `name + systemId` |
| PATCH | `params['id']`, JSON struct | `{corpId: [structs]}` | StructureModel | |
| DELETE | `params['id']` | `[deletedIds]` | StructureModel | |

#### `System`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| GET | `params['id']`, `mapId`, `isCcpId` (bool) | `system{data, signatures, sigHistory, structures, stations}` or null | SystemModel | `isCcpId` switches between map-system-id and universe-system-id lookup |
| PUT | JSON `mapId, systemId` | `SystemModel.getData()` | SystemModel, MapModel | Insert into map |
| PATCH | `params['id']`, JSON system | `SystemModel.getData()` | SystemModel | `statusId ≤ 0` is skipped |
| DELETE | `params['id']` (comma-sep), JSON `mapId` | `[deletedIds]` | SystemModel, MapModel | `checkDeleteMode()` honors `persistentAliases` / `persistentSignatures` map settings — may keep the system row inactive instead of deleting |

#### `SystemGraph`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| GET | query `systemIds[]` | `{[systemId]: {jumps:{data:[]}, shipKills:{data:[]}, ...}}` | SystemJumpModel, SystemShipKillModel, SystemPodKillModel, SystemFactionKillModel | 24×1h buckets; cached 10 min. Pod-kill counts merged into `shipKills.z`. |

#### `SystemSearch`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| GET | `params['id']` (token ≥3 chars), query `page` | `{results:[{id,name,trueSec,security,effect,shattered}], pagination:{more, count}}` | Universe SystemModel | Prefix-on-id, substring-on-name. 50/page. |

#### `SystemThera`
| Verb | Inputs | Output | Models | Notes |
|---|---|---|---|---|
| GET | — | `[{id, scope, created, updated, type[], estimatedEol, source{...}, target{...}, sourceSignature, targetSignature}]` | none direct; merges universe data | Calls EveScout (`[PATHFINDER.API].EVE_SCOUT`). Cached 1 min. Surface only — see Stage E. |

## Known issues / quirks

- **No CSRF tokens.** Same-origin cookies are the only mitigation. All admin GET routes are state-mutating.
- **Soft 200 on access failure.** REST endpoints return `[]` rather than 401/403 when entity access fails. Hard to distinguish "no records" from "no permission" client-side.
- **Setup AJAX has no auth.** `Api\Setup` exposes destructive operations (`buildIndex`, `clearIndex`, `cronPause`, `cronExecute`) without role check.
- **Throttle is bandwidth, not request count.** F3's `512` arg caps response kbps; abusive clients sending many small requests are not blocked at the framework level.
- **Beacon route has its own line.** `POST /api/Map/updateUnloadData` is declared outside the wildcard block so F3 dispatches the raw body before `[ajax]` handling — keeps `sendBeacon` payloads intact.
- **`getCookieState()` gate.** Cookie auth (`setLoginCookie`) only sets cookies when the user has accepted them in the cookie banner. Disabling cookies disables the multi-character login tile.
- **`getallheaders()` Nginx fallback** in `Controller.php:904` — parses `$_SERVER` directly because Apache's `apache_request_headers()` isn't available under php-fpm/nginx.
- **`Api\Map::initData` caches user-scoped data** in the global cache key. Confirm no cross-character leakage — flag for Stage I.
- **`Api\Map::updateUserData` returns ESI errors silently inside the `error[]` array** rather than failing the request, so client may treat partial-success as success.
- **CCP-API breakage history.** Comments in `Ccp/Sso.php` reference shifts in ESI verify endpoints and JWT verification. Track via Stage E.

## Open questions

1. Is `Api\Setup` intentionally unauthenticated, or is it expected that operators block `/api/Setup` at the web layer? (Affects deployment guide.)
**A:** Setup is protected by HTTP Basic Authentication by the proxy that serves the app. It is intended as a route that does not require SSO for initial setup and troubleshooting.
2. Does `512` correspond exactly to F3's `$kbps` bandwidth-throttle semantics across all F3 versions in use, or is it being used as a no-op marker?
3. Several REST controllers wrap mutations in `try/catch` that swallow `Exception` into `error[]`. Which exception types are user-facing vs which should produce 5xx?
4. `getLogData` cache TTL is keyed by `[PATHFINDER.HISTORY] CACHE` — confirm cache key includes `mapId` so different maps don't collide.
5. Cookie selector/validator pair format is documented as "selector + hashed token" but the on-wire cookie format is undocumented — confirm before rebuild migration.
6. WebSocket auth via `Api\Map::getAccessData` returns a 32-char token; the socket-side protocol that consumes it belongs in Stage D.
