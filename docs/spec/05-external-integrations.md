# 05 — External Integrations

> Stage E deliverable. See [doc-plan.md](../plan/doc-plan.md). Cross-refs: [03-backend-api.md](03-backend-api.md), [04-cron-and-background.md](04-cron-and-background.md), [02-data-model.md](02-data-model.md), [01-config-and-deployment.md](01-config-and-deployment.md).

## Purpose

Pathfinder talks to four external HTTP services and one outbound SMTP service. Every one of them has bitten the project at some point in its history (CCP ESI in particular is the chief source of recurring breakage). This document catalogues each integration: where it is configured, where it is invoked, what data crosses the boundary, what failure modes are handled, and which legacy quirks the rebuild needs to inherit or deliberately drop.

The four HTTP integrations:

| Integration | Vendor client class | Pathfinder wrapper | Base URL (configured in) |
|---|---|---|---|
| **CCP ESI** (EVE Online game data API) | `Exodus4D\ESI\Client\Ccp\Esi\Esi` | [`app/Lib/Api/CcpClient.php`](../../app/Lib/Api/CcpClient.php) | `CCP_ESI_URL` in [`app/environment.ini`](../../app/environment.ini) |
| **CCP SSO** (EVE OAuth2 IdP) | `Exodus4D\ESI\Client\Ccp\Sso\Sso` | [`app/Lib/Api/SsoClient.php`](../../app/Lib/Api/SsoClient.php) | `CCP_SSO_URL` in [`app/environment.ini`](../../app/environment.ini) |
| **EVE-Scout** (community Thera wormhole DB) | `Exodus4D\ESI\Client\EveScout\EveScout` | [`app/Lib/Api/EveScoutClient.php`](../../app/Lib/Api/EveScoutClient.php) | `PATHFINDER.API.EVE_SCOUT` in [`app/pathfinder.ini`](../../app/pathfinder.ini) (currently `https://api.eve-scout.com/v2/public`) |
| **GitHub API** (changelog/releases) | `Exodus4D\ESI\Client\GitHub\GitHub` | [`app/Lib/Api/GitHubClient.php`](../../app/Lib/Api/GitHubClient.php) | `PATHFINDER.API.GIT_HUB` in [`app/pathfinder.ini`](../../app/pathfinder.ini) (currently `https://api.github.com`) |

All four are concrete subclasses of [`Lib/Api/AbstractClient`](../../app/Lib/Api/AbstractClient.php) and are registered against the F3 service container as `$f3->ccpClient()`, `$f3->ssoClient()`, `$f3->eveScoutClient()`, `$f3->gitHubClient()` (see [01-config-and-deployment.md](01-config-and-deployment.md) for the boot wiring).

The full ESI swagger is checked into [`src/lib/esi/swagger.json`](../../src/lib/esi/swagger.json); endpoint identifiers in this document refer to that file's `operationId` values.

---

## 1. The shared HTTP client (AbstractClient)

[`AbstractClient`](../../app/Lib/Api/AbstractClient.php) is a Prefab (F3 singleton) that wraps the `monoliyoda/pathfinder_esi` Composer package (Guzzle-based). One instance per remote service.

**Shared behaviour applied by `__invoke()` (lazy init on first use):**

- `setTimeout(5)` / `setConnectTimeout(5)` — 5 s caps on every outbound request.
- `setUserAgent(...)` — builds `name - version | contact (SERVER_NAME)` from [`pathfinder.ini`](../../app/pathfinder.ini) `PATHFINDER` block (`name`, `version`, `contact`).
- `setDecodeContent('gzip, deflate')`.
- `setDebugLevel($f3->get('DEBUG'))` (F3 DEBUG 0–3).
- Loggable-request callback (`isLoggable()` in `AbstractClient.php:223`) suppresses logging during the configured `CCP_SSO_DOWNTIME` window (default `11:00`, 11 minutes wide — handled by `Config::inDownTimeRange()`). Errors during CCP daily downtime are deliberately silently dropped.
- Per-client log files: `esi_requests.log`, `esi_retry_requests.log`, `evescout_requests.log` under `LOGS` directory.
- PSR-6 cache pool injected into Guzzle cache middleware. Cache backend resolved from the `API_CACHE` DSN env var (Redis preferred → filesystem → ArrayCachePool). Redis pool is wrapped in a `NamespacedCachePool` keyed by `static::CLIENT_NAME` (`ccpClient` / `ssoClient` / `eveScoutClient` / `gitHubClient`).
- `__call()` magic forwards any unknown method to the underlying client and raises a 501 if the method is missing — this is why call sites use `$f3->ccpClient()->send('operationKey', ...)` rather than a typed API.

**Quirk — silent miss on missing vendor:** if the vendor class is not autoloadable, `getClient()` logs and returns `null`. The Prefab still exists, so all `$f3->xxxClient()->send(...)` calls raise a 501 at request time, not at boot. The rebuild should fail loudly on missing dependencies.

**Quirk — downtime range hardcoded to 11 minutes wide.** `CCP_SSO_DOWNTIME` is only a start time; the width is fixed in `Config::inDownTimeRange()`. ESI downtime moved/changed in length several times historically and this has been the source of false-quiet error periods.

---

## 2. CCP SSO (OAuth 2.0 / JWT)

Controller: [`app/Controller/Ccp/Sso.php`](../../app/Controller/Ccp/Sso.php) (extends `Controller\Api\User`).
Routes registered in [`app/routes.ini`](../../app/routes.ini) under the `/sso/...` aliases.
Token storage on the character row: see [`app/Model/Pathfinder/CharacterModel.php`](../../app/Model/Pathfinder/CharacterModel.php) (`esiAccessToken`, `esiAccessTokenExpires`, `esiRefreshToken`, `esiScopes`, `ownerHash`) — see [02-data-model.md](02-data-model.md) for column details.

### 2.1 Configuration

From [`app/environment.ini`](../../app/environment.ini):

| Key | Default (PRODUCTION block) | Meaning |
|---|---|---|
| `CCP_SSO_URL` | `https://login.eveonline.com` | TQ SSO base. SISI uses `https://sisilogin.testeveonline.com`. |
| `CCP_SSO_CLIENT_ID` | *(empty)* | OAuth client ID (must be set per deployment). |
| `CCP_SSO_SECRET_KEY` | *(empty)* | OAuth client secret. Obscured in admin Setup output (`Setup.php:323`). |
| `CCP_SSO_JWK_CLAIM` | `login.eveonline.com` | Expected `iss` claim substring in returned JWT access tokens. |
| `CCP_SSO_DOWNTIME` | `11:00` | CCP daily downtime start (server local). Used to suppress API error logging during the 11-minute downtime window. |
| `CCP_ESI_SCOPES` | (see below) | Space- or comma-separated list of ESI scopes requested for every login. |
| `CCP_ESI_SCOPES_ADMIN` | *(empty)* | Additional scopes requested only for `/sso/requestAdminAuthorization`. |

Both scope keys are parsed as arrays (`Config::ARRAY_KEYS`, [`app/Lib/Config.php:129`](../../app/Lib/Config.php)).

**Default scopes** (production environment block, [`environment.ini:93`](../../app/environment.ini)):

```
esi-location.read_online.v1
esi-location.read_location.v1
esi-location.read_ship_type.v1
esi-ui.write_waypoint.v1
esi-ui.open_window.v1
esi-universe.read_structures.v1
esi-corporations.read_corporation_membership.v1
esi-clones.read_clones.v1
esi-characters.read_corporation_roles.v1
esi-search.search_structures.v1
```

`CharacterModel::isAuthorized()` ([`CharacterModel.php:777`](../../app/Model/Pathfinder/CharacterModel.php)) re-checks login validity by diffing the *currently configured* scope set against the scopes stored on the character row — adding a scope to the config invalidates every existing session and forces a re-auth.

### 2.2 Authorization flow

```
Browser → GET /sso/requestAuthorization               (Sso::requestAuthorization)
       → 302 to https://login.eveonline.com/v2/oauth/authorize?
              response_type=code
              redirect_uri=<URL+BASE>/sso/callbackAuthorization
              client_id=<CCP_SSO_CLIENT_ID>
              scope=<CCP_ESI_SCOPES…>
              state=<32 hex chars from openssl_random_pseudo_bytes(12)>

CCP    → GET /sso/callbackAuthorization?code=…&state=…  (Sso::callbackAuthorization)
       1. state matched against SESSION.SSO.STATE; both cleared on match
       2. POST authorization_code → ssoClient->send('getAccess', [client_id, secret, 'basic'], …)
          → { accessToken, refreshToken, expiresIn }
          → esiAccessTokenExpires = now + expiresIn seconds (local TZ)
       3. verifyCharacterData(accessToken) → verifyJwtAccessToken(accessToken)
          → ssoClient->send('getJWKS') (CCP JWK set)
          → JWT::decode with JWK::parseKeySet + 10 s clock skew
          → iss claim spot-checked against CCP_SSO_JWK_CLAIM
          → returns { sub: "CHARACTER:EVE:<id>", scp: [...], owner: <ownerHash>, … }
       4. ccpClient->send('getCharacter', characterId)        (ESI: get_characters_character_id)
          ccpClient->send('getCharacterAffiliation', [id])    (ESI: post_characters_affiliation)
          → loads/creates Pathfinder\CorporationModel + AllianceModel by id
       5. updateCharacter() upserts Pathfinder\CharacterModel with
              {id, name, ownerHash, esiAccessToken, esiAccessTokenExpires,
               esiRefreshToken, esiScopes, securityStatus, corporationId, allianceId}
       6. CharacterModel::isAuthorized() gate (see 09-permissions-and-admin.md)
          - OK  → updateLog() → login session + "login" cookie → reroute to map
          - !OK → SESSION.SSO.ERROR = "Character …  is not authorized: <reason>"
```

The `SESSION.SSO.FROM` key (`'login' | 'map' | 'admin'`) tracks which alias initiated the SSO flow so callbacks reroute correctly.

### 2.3 Admin authorization

`/sso/requestAdminAuthorization` (`Sso::requestAdminAuthorization`) follows the same flow but unions `CCP_ESI_SCOPES_ADMIN` into the requested scope list and sets `SESSION.SSO.FROM = 'admin'` so the callback reroutes to `/admin`. In stock config `CCP_ESI_SCOPES_ADMIN` is empty — the admin gate is purely role-based (see [09-permissions-and-admin.md](09-permissions-and-admin.md)); the extra scope hook exists for deployments that want richer admin telemetry.

### 2.4 Token refresh

[`CharacterModel::getAccessToken()`](../../app/Model/Pathfinder/CharacterModel.php) at line 525:

1. If `esiAccessToken` is present and `esiAccessTokenExpires` is > now + 120 s buffer → return existing token.
2. Otherwise call `Sso::refreshAccessToken($esiRefreshToken)` which POSTs `grant_type=refresh_token` via `ssoClient->send('getAccess', auth, params)`.
3. On success, the new `esiAccessToken` / `esiAccessTokenExpires` are written back to the row (the refresh token itself is **not** rotated by Pathfinder — whatever CCP returns under `refreshToken` from the *initial* exchange is the long-lived one Pathfinder keeps).
4. On refresh failure (timeout, revoked token, CCP downtime) the old token is kept if still nominally valid, otherwise the call returns `false` and the caller treats the character as logged-out.

**Quirk — no token revocation call.** Logout (`User::logout`) just clears the session/cookie; the `esiRefreshToken` row is retained so the next interactive login picks the same character up cleanly. There is no path that calls CCP's `/v2/oauth/revoke`.

**Quirk — `ownerHash` is the canonical "this is the same character" signal.** CCP rotates `ownerHash` whenever a character is transferred between accounts. `updateCharacter()` writes the new hash unconditionally on every login; the auth-status check in [09-permissions-and-admin.md](09-permissions-and-admin.md) will refuse if `userCharacters` references a stale row.

### 2.5 Cookie-based ("Remember me") login

`/sso/login?cookie=<name>` (`Sso::login`) is the second SSO entry point — used by the login page's saved-character buttons. It does **not** talk to CCP at all: cookie data is validated against `character_authentication` rows (see [02-data-model.md](02-data-model.md)#characterauthentication and [`Cron\CharacterUpdate::deleteAuthenticationData`](../../app/Cron/CharacterUpdate.php)). On success it calls `loginByCharacter()` with the existing stored tokens.

`Cron\CharacterUpdate::deleteAuthenticationData` purges expired `character_authentication` rows every minute (see [04-cron-and-background.md](04-cron-and-background.md)).

### 2.6 SSO endpoints touched

| Pathfinder call site | Vendor method | Underlying CCP endpoint |
|---|---|---|
| `Sso::rerouteAuthorization` | `ssoClient->getAuthorizationEndpointURI()` (URL builder, not a call) | `GET /v2/oauth/authorize` |
| `Sso::requestAccessData` | `ssoClient->send('getAccess', auth, params)` | `POST /v2/oauth/token` (grant_type=authorization_code OR refresh_token) |
| `Sso::verifyJwtAccessToken` → `getCcpJwkData` | `ssoClient->send('getJWKS')` | `GET /oauth/jwks` |

---

## 3. CCP ESI (game data)

Configured via `CCP_ESI_URL` and `CCP_ESI_DATASOURCE` in [`environment.ini`](../../app/environment.ini). Defaults are `https://esi.evetech.net` and `tranquility` (or `singularity` in the SISI block).

Pathfinder uses ESI through one Prefab — `$f3->ccpClient()` — and routes every call through `->send('<opKey>', ...args)`. The vendor library maps opKey → swagger operation; below is the inventory of every distinct opKey used in the app code, paired with the matching swagger `operationId`.

### 3.1 ESI call inventory

| opKey (Pathfinder) | Swagger `operationId` | Auth | Cache window (vendor) | Call sites |
|---|---|---|---|---|
| `getStatus` *(not currently called)* | `get_status` | none | short | — |
| `getCharacter` | `get_characters_character_id` | none | long | [`Ccp/Sso.php:498`](../../app/Controller/Ccp/Sso.php), [`Universe/CharacterModel`](../../app/Model/Universe/) (lookup helpers) |
| `getCharacterAffiliation` | `post_characters_affiliation` | none | short | [`Ccp/Sso.php:511`](../../app/Controller/Ccp/Sso.php) |
| `getCharacterRoles` | `get_characters_character_id_roles` | character token | short | [`Pathfinder/CharacterModel::updateCorporationRoles`](../../app/Model/Pathfinder/CharacterModel.php) |
| `getCharacterClones` | `get_characters_character_id_clones` | character token | short | [`CharacterModel.php:793`](../../app/Model/Pathfinder/CharacterModel.php) (jump-clone overlay) |
| `getCharacterOnline` | `get_characters_character_id_online` | character token | very short | [`CharacterModel.php:817`](../../app/Model/Pathfinder/CharacterModel.php); used by `Cron\CharacterUpdate::deleteLogData` to garbage-collect offline pilots |
| `getCharacterLocation` | `get_characters_character_id_location` | character token | very short | [`CharacterModel.php:856`](../../app/Model/Pathfinder/CharacterModel.php) (`updateLog` — main "where is the pilot now" poll) |
| `getCharacterShip` | `get_characters_character_id_ship` | character token | very short | [`CharacterModel.php:968`](../../app/Model/Pathfinder/CharacterModel.php) (`updateLog`) |
| `getCorporation` | `get_corporations_corporation_id` | none | long | [`Universe/CorporationModel`](../../app/Model/Universe/CorporationModel.php), [`Pathfinder/CorporationModel.php:362`](../../app/Model/Pathfinder/CorporationModel.php) |
| `getCorporationRoles` | `get_characters_character_id_roles` (corp roles subset) | character token | short | [`Pathfinder/CorporationModel.php:297`](../../app/Model/Pathfinder/CorporationModel.php) |
| `getNpcCorporations` | `get_corporations_npccorps` | none | very long | corporation upsert paths to flag `isNPC` |
| `getAlliance` | `get_alliances_alliance_id` | none | long | `Universe\AllianceModel`, `Pathfinder\AllianceModel` |
| `setWaypoint` | `post_ui_autopilot_waypoint` | character token | n/a (mutation) | [`Api/System.php:42`](../../app/Controller/Api/System.php) (right-click → "set waypoint") |
| `openWindow` | `post_ui_openwindow_information` | character token | n/a (mutation) | [`Api/User.php:221`](../../app/Controller/Api/User.php) (right-click → "show info") |
| `getRoute` | `get_route_origin_destination` | none | short | [`Api/Rest/Route.php:711`](../../app/Controller/Api/Rest/Route.php) (autopilot/route module) |
| `search` | `get_characters_character_id_search` (uses `esi-search.search_structures.v1`) | character token | short | [`Ccp/Universe::searchUniverseNameData`](../../app/Controller/Ccp/Universe.php) → wrapped by [`Api/Universe`](../../app/Controller/Api/Universe.php) and [`Api/User`](../../app/Controller/Api/User.php) for structure search |
| `getUniverseNames` | `post_universe_names` | none | short | resolves heterogeneous `[id, …]` lists to `{id, name, category}`; used by `search`, jump-clone overlay, etc. |
| `getUniverseSystems` | `get_universe_systems` | none | very long | [`Cron/Universe::setup`](../../app/Cron/Universe.php) (every `type`), [`Cron/CcpSystemsUpdate`](../../app/Cron/CcpSystemsUpdate.php) (jump/kill table seed) |
| `getUniverseSystem` | `get_universe_systems_system_id` | none | very long | [`Universe/SystemModel`](../../app/Model/Universe/SystemModel.php) (4 sites — `loadById`, `updateModel`, build-index) |
| `getUniverseConstellations` / `getUniverseConstellation` | `get_universe_constellations` / `…_constellation_id` | none | very long | `Universe\ConstellationModel` |
| `getUniverseRegions` / `getUniverseRegion` | `get_universe_regions` / `…_region_id` | none | very long | `Universe\RegionModel` |
| `getUniverseCategories` / `getUniverseCategory` | `get_universe_categories` / `…_category_id` | none | very long | `Universe\CategoryModel`, used by [`Ccp/Universe::setupCategory`](../../app/Controller/Ccp/Universe.php) |
| `getUniverseGroups` / `getUniverseGroup` | `get_universe_groups` / `…_group_id` | none | very long | `Universe\GroupModel`, [`Ccp/Universe::setupGroup`](../../app/Controller/Ccp/Universe.php) |
| `getUniverseType` | `get_universe_types_type_id` | none | very long | `Universe\TypeModel` |
| `getUniversePlanet` | `get_universe_planets_planet_id` | none | very long | `Universe\PlanetModel`, called via `SystemModel::loadPlanetsData()` |
| `getUniverseStargate` | `get_universe_stargates_stargate_id` | none | very long | `Universe\StargateModel`, called via `SystemModel::loadStargatesData()` |
| `getUniverseStation` | `get_universe_stations_station_id` | none | very long | `Universe\StationModel`, called via `SystemModel::loadStationsData()` |
| `getUniverseStar` | `get_universe_stars_star_id` | none | very long | `Universe\StarModel` |
| `getUniverseRace` | `get_universe_races` (filtered) | none | very long | `Universe\RaceModel` |
| `getUniverseFaction` | `get_universe_factions` (filtered) | none | very long | `Universe\FactionModel` |
| `getUniverseStructure` | `get_universe_structures_structure_id` | character token (`esi-universe.read_structures.v1`) | short | [`Universe/StructureModel.php:93`](../../app/Model/Universe/StructureModel.php) (player-built citadels) |
| `getDogmaAttribute` | `get_dogma_attributes_attribute_id` | none | very long | `Universe\DogmaAttributeModel` (only populated when `GroupModel::storeDogmaAttributes` is set during setup) |
| `getUniverseJumps` | `get_universe_system_jumps` | none | hourly | [`Cron/CcpSystemsUpdate.php`](../../app/Cron/CcpSystemsUpdate.php) (jumps-per-system table) |
| `getUniverseKills` | `get_universe_system_kills` | none | hourly | [`Cron/CcpSystemsUpdate.php`](../../app/Cron/CcpSystemsUpdate.php) (ship/pod/NPC kills per system) |
| `getSovereigntyMap` | `get_sovereignty_map` | none | hourly | [`Cron/Universe::updateSovereigntyData`](../../app/Cron/Universe.php), `setup(type=sovereignty)` |
| `getFactionWarSystems` | `get_fw_systems` | none | hourly | `Cron/Universe::updateSovereigntyData` (combined sov+FW pass), `setup(type=faction_war_systems)` |

**Notes on the inventory:**

- The vendor `monoliyoda/pathfinder_esi` package is not present in the working tree (no `vendor/` directory). The opKey → operationId mapping above was derived from call-site signatures and from `src/lib/esi/swagger.json` cross-checking. Any opKey that turns out to dispatch to a different swagger op should be corrected here — but the call-site code itself is authoritative for *what arguments* are sent.
- "Cache window" descriptors are qualitative — Guzzle cache middleware honours CCP's `Cache-Control: max-age` headers; values of "very long" correspond to CCP's day+ static-universe TTLs.
- Every authenticated call passes `$accessToken` as a positional argument; the underlying client appends it as the `Authorization: Bearer …` header. Tokens never appear in URL strings.

### 3.2 Cron-driven ESI usage

Three of the nine cron jobs (see [04-cron-and-background.md](04-cron-and-background.md)) are ESI-driven:

- `Cron\CcpSystemsUpdate::updateAll` (every minute) — pulls `getUniverseJumps` + `getUniverseKills`, writes to `system_jumps`, `system_kills_ships`, `system_kills_pods`, `system_kills_factions` (rolling 1h history).
- `Cron\Universe::updateSovereigntyData` (every minute, throttled by execution time) — pulls `getSovereigntyMap` + `getFactionWarSystems`, calls `SystemModel::updateSovereigntyData()` / `updateFactionWarData()` and rebuilds the search index for changed systems. Wormhole systems (`security` starting with `C`) are explicitly skipped even though CCP returns them in the sov map — see comment at [`Cron/Universe.php:328`](../../app/Cron/Universe.php).
- `Cron\Universe::updateUniverseSystems` (every minute) — *currently a no-op stub:* fetches 2 oldest systems and calls `updateModel()`. Flagged as half-finished WIP, listed in [10-feature-matrix.md](10-feature-matrix.md).
- `Cron\Universe::setup` — *not scheduled*, only runnable via the admin Setup UI (`POST /setup/...`) or `php index.php "/cron/setup?type=...&offset=...&length="`. Bootstrap-only: imports static universe data for `system | stargate | station | sovereignty | faction_war_systems | index_system`.
- `Cron\CharacterUpdate::deleteLogData` (every minute) — pulls `getCharacterOnline` per stale character_log row, deletes the row if the pilot is offline or the access token cannot be refreshed.

### 3.3 ESI-driven request paths (controllers)

- `POST /api/System/setWaypoint` ([`Api/System.php:42`](../../app/Controller/Api/System.php)) — proxies to `setWaypoint` with `{ clear_other_waypoints, add_to_beginning }` options.
- `POST /api/User/openWindow` ([`Api/User.php:221`](../../app/Controller/Api/User.php)) — opens the EVE in-game info window for `targetId`.
- `GET /api/Universe/search` — text search via `Ccp\Universe::searchUniverseNameData` (character-scoped `search` + `getUniverseNames` resolve).
- `GET /api/rest/Route/...` — autopilot route lookup via `getRoute`.
- All structure detail loads in the map sidebar — via `Universe\StructureModel::loadModel()` → `getUniverseStructure` (requires the active character's token; failures degrade to "structure unknown").

**Quirk — character location polling drives most of the load.** The biggest single source of ESI traffic is `CharacterModel::updateLog()`, which is hit on every active map render and by the websocket push loop (see [04-cron-and-background.md](04-cron-and-background.md) and [`react/socket` server](../../app/Lib/Socket/)). Per pilot it issues three calls (`getCharacterLocation`, `getCharacterShip`, sometimes `getUniverseNames` to resolve a structure docked into). When CCP changes location-endpoint behaviour, the map "current system" jumps stop updating — this has been the modal failure mode historically.

**Quirk — `securityStatus` only loaded at SSO, never refreshed.** `Sso::getCharacterData()` plucks `securityStatus` from `getCharacter` once at login (`Sso.php:501`); no cron job re-pulls it. A pilot's sec status displayed in the local-pilots widget can be stale for the lifetime of the access token.

---

## 4. EVE-Scout (Thera connections)

Vendor client: `Exodus4D\ESI\Client\EveScout\EveScout`. Base URL `https://api.eve-scout.com/v2/public`.

Single endpoint used: `eveScoutClient->send('getTheraConnections')` → community-maintained list of currently scanned Thera-to-K-space wormhole connections (and as of v2, Turnur as well — the data shape is `{system_source, system_target, …}` per row).

Call sites:
- [`Api/Rest/Route.php:285`](../../app/Controller/Api/Rest/Route.php) (`setTheraJumpData`) — augments the autopilot route graph with Thera shortcuts.
- [`Api/Rest/SystemThera.php:113`](../../app/Controller/Api/Rest/SystemThera.php) — backs the "Thera" UI module.

Result is memoised in F3 cache under `CACHE_KEY_THERA_JUMP_DATA` (short TTL).

**Quirk — verbose logging by design.** `EveScoutClient` overrides the default log knobs (`setLogStats(true)`, `setLogCache(true)`, `setLogAllStatus(true)`, `setLogRequestHeaders(true)`, `setLogResponseHeaders(true)` — every request logged regardless of HTTP status) to `evescout_requests.log`. This is *intentional* — EVE-Scout's API has historically returned silent shape changes that only surface in headers/bodies, so the team kept the firehose on.

**Quirk — error envelope is a string key.** EVE-Scout error responses arrive shaped like `['error' => '…']`; both call sites check `isset($connectionsData['error'])` before treating the response as a row array.

---

## 5. GitHub API (changelog)

Vendor client: `Exodus4D\ESI\Client\GitHub\GitHub`. Base URL `https://api.github.com`.

Controller: [`app/Controller/Api/GitHub.php`](../../app/Controller/Api/GitHub.php). Single action `releases()` mapped from `/api/GitHub/releases` (see [03-backend-api.md](03-backend-api.md)).

Calls:
- `gitHubClient->send('getProjectReleases', 'thump3d/pathfinder', 4)` → `GET /repos/thump3d/pathfinder/releases?per_page=4`.
- `gitHubClient->send('markdownToHtml', 'exodus4d/pathfinder', $body)` → `POST /markdown` with `{ mode: 'gfm', context: 'exodus4d/pathfinder', text: … }` to render release notes server-side (preserves issue/PR autolinks). Falls back to F3's `Markdown` plugin if the GH call fails.

Response shape returned to the frontend:
```
{
  releasesData: [ { name, body (HTML), … }, … ],
  version: { current: <pathfinder.ini PATHFINDER.VERSION>, last, delta, dev }
}
```

`delta` = how many releases behind the deployed instance is. `dev = true` when local version is *ahead* of the latest GitHub release.

**Quirk — repo name mismatch.** `getProjectReleases` queries `thump3d/pathfinder` (the current maintainer fork) but `markdownToHtml` passes `exodus4d/pathfinder` as the link-resolution context. Historical artefact — the fork rename was incomplete. Rebuild should normalise on one repo slug.

**Quirk — release body is mutated.** The body is truncated at the first `***` marker (used in upstream release notes to separate "what's new" from update instructions), then ` - ` is naively replaced with `* ` before rendering. The rebuild should source release notes from a structured changelog rather than from GitHub markdown body parsing.

**Quirk — unauthenticated rate limit.** `GitHubClient` does not configure an API token; calls are subject to the 60 req/h anonymous limit (shared by server IP). Cache TTL is dictated solely by Guzzle middleware and GitHub's `Cache-Control` headers.

---

## 6. Outbound mail (SwiftMailer)

Pathfinder does *not* send transactional user mail — there is no signup-confirmation, password-reset, or notification path. The mail integration exists only for **error/alert log forwarding**.

### 6.1 Transport

Configured by SMTP_* keys in [`environment.ini`](../../app/environment.ini):

| Key | Purpose |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` | Server (`localhost:25` default) |
| `SMTP_SCHEME` | `TLS` (passed to `Swift_SmtpTransport::setEncryption`) |
| `SMTP_USER` / `SMTP_PASS` | Auth (PASS is obscured in setup output) |
| `SMTP_FROM` | From address |
| `SMTP_ERROR` | To address for error/alert logs |

Constructed in [`Lib/Logging/AbstractLog::getHandlerParamsMail()`](../../app/Lib/Logging/AbstractLog.php) at line 504. The transport is built per-log (no shared mailer pool) with `allow_self_signed` + `verify_peer=false` on the TLS stream — see quirk below.

### 6.2 Message construction

`AbstractLog::getHandlerParamsMail()`:
1. Builds a `Swift_SmtpTransport` from the SMTP_* values.
2. Wraps it in `Swift_Mailer`.
3. Builds a callback that, given the formatted log content + the underlying records, produces a `Swift_Message`:
   - Subject = first record's `message` field with `*` and `_` (markdown) stripped.
   - Body part = JSON-encoded record array.
   - HTML body = rendered by `Lib\Logging\Formatter\MailFormatter` → `Template::instance()->render('templates/mail/basic_inline.html', 'text/html', $tplData)` using markdown → HTML via F3's Markdown.
   - Optional attachment: full JSON record set as `data.json` when the log declares `addJson = true`.
4. The mailer + callback are passed to Monolog's `SwiftMailerHandler`, registered with `BufferHandler` so messages are coalesced and flushed at end-of-request.

### 6.3 Templates

`public/templates/mail/`:
- [`basic.html`](../../public/templates/mail/basic.html) — full template with inline `<style>` block (responsive dark-themed layout). Variables: `@tplPretext`, `@tplGreeting` (raw HTML), `@message`, `@actionPrimary`, `@tplText2`, `@tplClosing`, `@appContact`, `@appMail`, `@appUrl`, `@appName`, `@appHost`. Not currently rendered anywhere I can find — appears to be the source for `basic_inline.html`.
- `basic_inline.html` — the version actually rendered by [`Lib/Logging/Formatter/MailFormatter.php`](../../app/Lib/Logging/Formatter/MailFormatter.php). Same variables; styles are inlined on every element for mail-client compatibility.

`MailFormatter::format()` populates:
- `tplGreeting` = markdown-rendered first log message (asterisks stripped).
- `tplText2`, `tplClosing` = from log context.
- `appContact`, `appMail`, `appUrl`, `appName`, `appHost` = from `PATHFINDER.NAME / VERSION / CONTACT / EMAIL` in [`pathfinder.ini`](../../app/pathfinder.ini).

### 6.4 What actually triggers mail

The `mail` handler is only attached to logs that opt in by declaring `mail` in their `handlerConfig`. Survey of log subclasses (under [`app/Lib/Logging/`](../../app/Lib/Logging/) and [`app/Controller/LogController`](../../app/Controller/LogController.php)) shows: there is no log type configured with the `mail` handler in the stock distribution. The plumbing exists, but the only way to wire it in is to override a log class in a deployment — useful but not used in tree.

**Quirk — TLS verification disabled.** `allow_self_signed=true` and `verify_peer=false` are hardcoded in `getHandlerParamsMail()`. This was added so the default localhost SMTP-with-self-signed-cert setup "just works"; the rebuild should make this configurable, not the default.

**Quirk — Slack / Discord webhook handlers exist alongside mail.** [`Lib/Monolog.php:55`](../../app/Lib/Monolog.php) registers `socket`, `slackMap`, `slackRally`, `discordMap`, `discordRally` Monolog handlers — these are *also* outbound integrations but treated as logging sinks. See [04-cron-and-background.md](04-cron-and-background.md) for the rally-broadcast use cases; they are configured per-map in the admin UI rather than from `environment.ini`.

---

## 7. Static-data import path

Pathfinder maintains a second MySQL database (`UNIVERSE`) of static EVE data: regions, constellations, systems, stargates, stations, planets, stars, types, groups, categories, dogma attributes, races, factions, NPC corps, alliances.

### 7.1 Sources

Two seed paths in [`export/`](../../export/):

| File | Purpose |
|---|---|
| [`export/sql/eve_universe.sql.zip`](../../export/sql/) | Full Universe DB dump — used as the initial bootstrap by the Setup UI. |
| `export/sql/pochven_and_trailblazer.sql` | Patch applied after the main dump — adds the Pochven region (added by CCP June 2020) and Trailblazer wormhole rows. The main dump pre-dates Pochven. |
| `export/sql/zarzakh.sql` | Patch — adds the Zarzakh system / J7HZ-F gates (added by CCP Aug 2023). |
| [`export/csv/system_static.csv`](../../export/csv/) | Per-system static attributes (effects, statics, class) keyed by `systemId`. Loaded by `SystemModel::loadStaticData()`. |
| [`export/csv/wormhole.csv`](../../export/csv/) | Wormhole type table: name, target class, max mass, max jump mass, lifetime, scan strength, regeneration, jump trigger. Loaded into `wormhole` table. |

### 7.2 Setup flow

`POST /setup/buildDatabase` and the AJAX endpoints under `/api/Setup/...` (see [03-backend-api.md](03-backend-api.md)) run in this order:

1. Restore `eve_universe.sql.zip` into the configured `DB_UNIVERSE_*` connection.
2. Apply `pochven_and_trailblazer.sql` then `zarzakh.sql`.
3. Optionally pull *additional* live data from ESI via `Ccp\Universe::setupCategory()` / `setupGroup()` — runs `getUniverseCategories` → `getUniverseGroups` → `getUniverseType` per type. The Setup UI exposes whitelists (commented sample sets in [`Ccp/Universe.php`](../../app/Controller/Ccp/Universe.php)) — Ship (cat 6), Structure (cat 65), and Celestial (cat 2) are the obvious candidates.
4. Run `setup?type=system,stargate,station,sovereignty,faction_war_systems,index_system` via [`Cron/Universe::setup`](../../app/Cron/Universe.php) — each is a chunked loop (offset/length params, looping over `getUniverseSystems` ids and per-id calls). Designed to be polled by the Setup UI: each chunk returns progress so the page can show a bar and resume from `offset`.
5. Final step `index_system` builds the in-memory + cache search index for the system autocomplete (`AbstractUniverseModel::CACHE_INDEX_EXPIRE_KEY` namespace).

**Quirk — bootstrap and patch SQLs duplicate ESI data.** The static SQL dump is much faster to load than walking ESI; the workaround for new content (Pochven, Zarzakh) is hand-rolled per-expansion SQL patches. There is no automated drift detection between the SQL baseline and current ESI. The `updateUniverseSystems` cron stub at [`Cron/Universe.php:379`](../../app/Cron/Universe.php) was the abandoned attempt to close this loop.

**Quirk — `getUniverseSystems` is called repeatedly even within a single setup pass** ([`Cron/Universe.php:189, 198, 206, 246`](../../app/Cron/Universe.php)) because each branch of the `switch` re-fetches the full id list. Cheap (cached by CCP) but unnecessary.

---

## 8. Cross-references

- Cron job schedules and the websocket server live in [04-cron-and-background.md](04-cron-and-background.md).
- Models touched by SSO callback (`CharacterModel`, `UserCharacterModel`, `CharacterAuthenticationModel`, `CharacterLogModel`, `CorporationModel`, `AllianceModel`, `StructureModel`) are defined in [02-data-model.md](02-data-model.md).
- HTTP routes (`/sso/...`, `/api/User/...`, `/api/System/...`, `/api/GitHub/releases`, `/api/Universe/search`, `/api/rest/Route/...`, `/setup/...`) are catalogued in [03-backend-api.md](03-backend-api.md).
- The `isAuthorized()` gate that decides which SSO logins are accepted is in [09-permissions-and-admin.md](09-permissions-and-admin.md).
- Feature-matrix rows touched by this stage are flagged in [10-feature-matrix.md](10-feature-matrix.md) under "External Integrations".

---

## Self-check (per Working method)

**Critical files coverage:**
- [x] [`app/Controller/Ccp/Sso.php`](../../app/Controller/Ccp/Sso.php) — full flow walked (§2).
- [x] [`app/Controller/Ccp/Universe.php`](../../app/Controller/Ccp/Universe.php) — category/group/system setup helpers (§3, §7).
- [x] [`app/Controller/Api/GitHub.php`](../../app/Controller/Api/GitHub.php) — §5.
- [x] [`app/Lib/Api/AbstractClient.php`](../../app/Lib/Api/AbstractClient.php) — §1.
- [x] [`app/Lib/Api/CcpClient.php`](../../app/Lib/Api/CcpClient.php), [`SsoClient.php`](../../app/Lib/Api/SsoClient.php), [`EveScoutClient.php`](../../app/Lib/Api/EveScoutClient.php), [`GitHubClient.php`](../../app/Lib/Api/GitHubClient.php) — §1.
- [x] `vendor/monoliyoda/pathfinder_esi` — **not present in working tree.** opKey → swagger mapping inferred from call sites and `src/lib/esi/swagger.json`. See open question below.
- [x] [`public/templates/mail/`](../../public/templates/mail/) (`basic.html`, `basic_inline.html`) — §6.
- [x] `app/Lib/Esi*` — not present (no such files); ESI access is exclusively through `app/Lib/Api/CcpClient.php`.

**Entry-point coverage:** every `*Client()->send(...)` opKey grepped across `app/` (37 distinct sites, 38 calls) is listed in §3.1, §4, §5.

## Open questions

1. **Vendor opKey → swagger op mapping.** The `monoliyoda/pathfinder_esi` package is not vendored in this checkout. The §3.1 table maps opKeys to `operationId`s based on argument signatures and naming; before the rebuild commits to a TypeScript ESI client, someone should diff each opKey against the vendor source (the `KitchenSinkhole/pathfinder_esi` fork referenced in [`composer.json`](../../composer.json) `repositories`) to confirm exact request shapes — especially for `setWaypoint`, `openWindow`, and `getRoute` (option-bag arguments differ between vendor versions).
2. **`searchUniverseNameData` scopes.** The `search` call goes via the character's token. The configured `esi-search.search_structures.v1` scope only grants structure search; whether the call also implicitly searches non-structure categories (which would be an `esi-search.search_*` family) needs a live trace.
3. **`refreshAccessToken` rotation behaviour.** CCP's SSO v2 *can* return a new refresh token on every grant. `Sso::requestAccessData` writes whatever `refreshToken` arrives back into `accessData`, but `CharacterModel::getAccessToken()` ([`CharacterModel.php:566`](../../app/Model/Pathfinder/CharacterModel.php)) only persists `esiAccessToken` and `esiAccessTokenExpires` — not `esiRefreshToken`. If CCP starts rotating refresh tokens (or has been), Pathfinder would slowly stop being able to refresh. Worth confirming against current CCP docs before the rebuild.
4. **Mail templates rendered but never sent.** Confirm whether any deployment uses the `mail` Monolog handler (search deployment configs / `app/environment.ini` overrides). If not, the rebuild can drop SwiftMailer entirely and replace with a webhook-only alert path.
5. **Static-data sync strategy for the rebuild.** Stage J needs to decide: keep the SQL-dump + ESI-walk hybrid, or rebuild as a streaming sync from CCP's SDE (yaml) + ESI deltas. The current approach has produced two manual patch files (Pochven, Zarzakh) in the last 5 years; that cadence will continue.
