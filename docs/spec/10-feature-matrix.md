# 10 — Feature Matrix (skeleton)

**Stage A output, skeleton only.** This is the master checklist for the rebuild. It enumerates every user-visible / operator-visible feature derived from `pathfinder.ini` flags, routes, dialog filenames, module filenames, and cron jobs. Later stages fill in the linked spec sections, DB tables, API endpoints, and cron interactions; Stage I closes out the audit.

Legend: `→` cross-references will be added by later stages. `?` = open question / WIP. `✗` = appears dead / disabled.

## How to read this

Each row is **one feature** at a granularity a product manager would recognise (not one route, not one function). A feature can span multiple stages — the column links lead to the authoritative spec for each layer.

| Column | Filled by |
|---|---|
| Feature | Stage A |
| Scope (private / corp / alliance / global / admin) | Stage A |
| UI surface | Stage F/G/H |
| API endpoints | Stage C |
| DB tables | Stage B → [02-data-model.md](02-data-model.md) |
| Cron interactions | Stage D |
| External integrations | Stage E |
| Permissions | Stage C |
| Status / quirks | Stage I |

---

## 1. Authentication & accounts

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| EVE SSO login (OAuth2 + JWT) | global | `view/login.html`, `templates/modules/sso.html` | `/sso/*` → `Ccp\Sso` | character, character_auth | — | CCP SSO | surface in [03](03-backend-api.md#controllerccpsso--get-ssoaction); flow → E |
| "Remember me" character cookies | global | login tile grid | `/api/User/getCookieCharacter` | character_auth | — | — | `COOKIE_EXPIRE=30d`; `AppController` reads `COOKIE_PREFIX_CHARACTER`; no auto-login (see [03](03-backend-api.md)) |
| Multi-character switching | per-user | char-switch tooltip (`tooltip/character_switch.html`) | `/api/User/getCookieCharacter`, `/api/User/logout` | character, user | — | ESI | [03](03-backend-api.md#apiuser-controller--mixed-action-level-checks) |
| Account settings dialog | per-user | `dialog/account_settings.js` | `/api/User/saveAccount`, `/api/User/getCaptcha` | user, corp, ally, character | — | — | captcha-gated; [03](03-backend-api.md#apiuser-controller--mixed-action-level-checks) |
| Delete account | per-user | `dialog/delete_account.js`, `dialog/delete_account.html` | `/api/User/deleteAccount`, `/api/User/getCaptcha` | user (cascade) | `deleteAuthenticationData` | — | captcha-gated; logs to `account_delete.log` |
| Maintenance mode whitelist | global | landing | — | — | — | — | `[PATHFINDER.LOGIN] MODE_MAINTENANCE=1` + `CHARACTER`/`CORPORATION`/`ALLIANCE` |
| Registration enable/disable | global | landing | — | — | — | — | `[PATHFINDER.REGISTRATION] STATUS` |
| Subdomain session sharing | global | — | — | — | — | — | `[PATHFINDER.LOGIN] SESSION_SHARING` |

## 2. Map lifecycle

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Create private map | private | `dialog/map_settings.js`, `form/map.html` | `/api/rest/Map`, `/api/Map/*` | map | — | — | limits: `MAX_COUNT=3`, `MAX_SYSTEMS=50`, `LIFETIME=60d` |
| Create corp map | corp | `dialog/map_settings.js` | `/api/rest/Map` | map | — | — | `MAX_COUNT=5`, `MAX_SYSTEMS=100`, `LIFETIME=∞` |
| Create alliance map | alliance | `dialog/map_settings.js` | `/api/rest/Map` | map | — | — | `MAX_COUNT=4`, `MAX_SYSTEMS=100`, `LIFETIME=∞` |
| Share map with other corp/alliance | per-map | map settings | `/api/rest/Map`, `/api/Access/*` | map_access | — | — | `MAX_SHARED` per scope |
| Map info dialog | per-map | `dialog/map_info.js`, `dialog/map_info.html` | `/api/Map/*` | map | — | — | |
| Map manual / help | per-map | `dialog/map_manual.html`, `dialog/manual.js` | — | — | — | — | static help |
| Map deletion | per-map | map settings | `/api/rest/Map` | map | `deleteMapData` (downtime) | — | soft-delete → cron hard-delete |
| Map auto-expiry by lifetime | scope | — | — | map | `deactivateMapData` (hourly) | — | by `LIFETIME` |
| Map history log | per-map | `dialog/connection_log.html` | `/api/rest/Log` | — (NDJSON) | `truncateMapHistoryLogFiles` (30m) | — | `[PATHFINDER.HISTORY]` |
| Map history Slack/Discord broadcast | per-map | — | — | map | — | Slack, Discord | `SEND_HISTORY_*_ENABLED` |

## 3. Systems on the map

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Add system to map | per-map | map canvas drag, `dialog/system.html` | `/api/System/*`, `/api/rest/System` | system | — | ESI search | → G |
| System search autocomplete | per-map | `system` dialog | `/api/rest/SystemSearch` | (universe) | — | — | |
| Move / position system node | per-map | jsPlumb drag, magnetize | `/api/Map/*` | system | — | — | → G |
| Auto-layout map | per-map | `js/app/map/layout.js` | — (client) | — | — | — | → G |
| Snap-to-grid / magnetize | per-map | `js/app/map/magnetizing.js` | — | — | — | — | → G |
| System info module | per-map | `module/system_info.js`, `modules/system_info.html` | `/api/rest/System` | system, universe | — | — | → H |
| System intel notes | per-map | `module/system_intel.js` | `/api/Map/*`, `/api/rest/System` | system | — | — | → H |
| System killboard module | per-map | `module/system_killboard.js`, `modules/killmail.html` | — | — | — | zKillboard | → H, E |
| System route module | per-map | `module/system_route.js`, `dialog/route.html`, `dialog/route_settings.html` | `/api/rest/Route` | (universe) | — | — | `[PATHFINDER.ROUTE]` |
| System graph module | per-map | `module/system_graph.js` | `/api/rest/SystemGraph` | system, connection | — | — | → H |
| System effects info | global | `dialog/system_effects.js`, `tooltip/system_popover.html` | — | (static data) | — | — | |
| System tag plugin | per-map | `module/tags.js` | — | system | — | — | `[PATHFINDER.SYSTEMTAG]`, `HOME_SYSTEM_ID=31000376` |
| Rally point | per-system | `dialog/system_rally.html` | `/api/System/*` | system | — | Slack, Discord, Mail | `SEND_RALLY_*_ENABLED` |
| Auto-select pilot's current system | per-user | client | — | character | — | ESI location | `[PATHFINDER.CHARACTER] AUTO_LOCATION_SELECT` |

## 4. Connections (wormhole edges)

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Create connection (drag) | per-map | `js/app/map/connection*.js` | `/api/rest/Connection` | connection | — | — | → G |
| Connection type cycling (wh / jumpbridge / stargate) | per-map | context menu | `/api/rest/Connection` | connection | — | — | → G |
| Mass flag (fresh/half/critical) | per-conn | context menu | `/api/rest/Connection` | connection | — | — | → G |
| EOL flag | per-conn | context menu | `/api/rest/Connection` | connection | `deleteEolConnections` (5m) | — | `EXPIRE_CONNECTIONS_EOL=15300s` |
| Frigate-hole flag | per-conn | context menu | `/api/rest/Connection` | connection | — | — | |
| Preserve-mass flag | per-conn | context menu | `/api/rest/Connection` | connection | — | — | |
| K162 / wormhole type label | per-conn | inline | `/api/rest/Connection` | connection | — | — | |
| Connection auto-expire | per-conn | — | — | connection | `deleteExpiredConnections` (hourly) | — | `EXPIRE_CONNECTIONS_WH=172800s` |
| Connection info module | per-conn | `module/connection_info.js`, `dialog/connection_log.html` | `/api/rest/Connection` | connection | — | — | → H |
| Jump info dialog | global | `dialog/jump_info.js`, `dialog/jump_info.html` | — | (static) | — | — | |

## 5. Signatures

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Add / edit signature | per-system | `module/system_signature.js` | `/api/rest/Signature` | signature | — | — | → G/H |
| D-Scan paste import | per-system | `dialog/dscan_reader.html` | `/api/rest/Signature` | signature | — | — | |
| Signature paste reader | per-system | `dialog/signature_reader.html` | `/api/rest/Signature` | signature | — | — | |
| Signature history (versioning) | per-system | — | `/api/rest/SignatureHistory` | signature_history | — | — | → B |
| Signature auto-delete | per-system | — | — | signature | `deleteSignatures` (30m) | — | `EXPIRE_SIGNATURES=259200s` |

## 6. Realtime / multi-user

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Realtime map push | per-map | `js/app/map/worker.js` | TCP socket (react/ndjson) | — | — | — | → D, G; uses `SOCKET_HOST/PORT` |
| Server→client map updates | per-map | — | — | — | (handled via socket) | — | `UPDATE_CLIENT_MAP.EXECUTION_LIMIT=100` |
| Client→server map updates | per-map | — | `/api/Map/*` | map, system, connection | — | — | `UPDATE_SERVER_MAP.DELAY=5000ms` |
| User data push (pilot positions) | per-map | header / local | — | character_log | `deleteLogData` (instant) | ESI location | `UPDATE_SERVER_USER_DATA.DELAY=5000ms` |
| Local pilots indicator | per-map | `js/app/map/local.js` | — | character_log | — | — | → G |
| Page-unload notification | per-user | — | `POST /api/Map/updateUnloadData` | — | — | — | beacon on tab close |

## 7. Notifications & broadcasts

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Slack rally broadcast | per-map | — | server-side | map | — | Slack webhook | `[PATHFINDER.SLACK].STATUS`, `SEND_RALLY_SLACK_ENABLED` |
| Slack history broadcast | per-map | — | server-side | map | — | Slack webhook | `SEND_HISTORY_SLACK_ENABLED` |
| Discord rally broadcast | per-map | — | server-side | map | — | Discord webhook | `[PATHFINDER.DISCORD].STATUS`, `SEND_RALLY_DISCORD_ENABLED` |
| Discord history broadcast | per-map | — | server-side | map | — | Discord webhook | `SEND_HISTORY_DISCORD_ENABLED` |
| Mail rally broadcast | per-map | `templates/mail/basic*.html` | server-side | map | — | SMTP | `SEND_RALLY_Mail_ENABLED` (off by default), `RALLY_SET` |
| pnotify in-app notifications | per-user | client | — | — | — | — | `dialog/notification.js`, `dialog/notification.html` |

## 8. Admin / operator

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Admin login | global | `admin/login.html` | `/admin*` → `Controller\Admin->dispatch` | — | — | — | logs to `admin.log` |
| Admin: maps list | global | `admin/maps.html` | `/admin*` | map | — | — | |
| Admin: members | global | `admin/members.html` | `/admin*` | user, character | — | — | |
| Admin: notification config | global | `admin/notification.html` | `/admin*` | — | — | — | |
| Admin: global settings | global | `admin/settings.html` | `/admin*` | — | — | — | |
| First-run setup wizard | global | `view/setup.html`, `modules/requirements_table.html`, `modules/sync_status.html` | `/setup` → `Controller\Setup` | (init) | — | ESI | runs DB schema bootstrap |
| API status dialog | per-user | `dialog/api_status.js`, `dialog/api_status.html` | — | — | — | ESI ping | → E |
| Statistics dialog | per-user | `dialog/stats.js`, `dialog/stats.html` | `/api/Statistic/*` | activity_log | `deleteStatisticsData` (weekly) | — | |
| Changelog (GitHub) | global | `dialog/changelog.js` | `/api/GitHub/*` | — | — | GitHub API | `[PATHFINDER.API].GIT_HUB` |
| Credits | global | `dialog/credit.js`, `dialog/credit.html` | — | — | — | — | |
| Manual / docs | global | `dialog/manual.js`, `dialog/map_manual.html` | — | — | — | — | |
| Shortcuts dialog | global | `dialog/shortcuts.js`, `dialog/shortcuts.html` | — | — | — | — | `js/app/key.js` |

## 9. External integrations

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| CCP SSO OAuth2 | global | `templates/modules/sso.html` | `/sso/*` | character_auth | `deleteAuthenticationData` (downtime) | CCP SSO | scopes per `CCP_ESI_SCOPES` |
| ESI: pilot location | per-user | — | server | character_log | `cleanUpCharacterData` (hourly) | ESI | `esi-location.read_location.v1` |
| ESI: pilot online | per-user | — | server | character_log | — | ESI | `esi-location.read_online.v1` |
| ESI: ship type | per-user | — | server | character_log | — | ESI | `esi-location.read_ship_type.v1` |
| ESI: set waypoint | per-user | route module | server | — | — | ESI | `esi-ui.write_waypoint.v1` |
| ESI: open in-game window | per-user | context menus | server | — | — | ESI | `esi-ui.open_window.v1` |
| ESI: structure resolution | per-system | structure dialog | `/api/rest/Structure` | structure | — | ESI | `esi-universe.read_structures.v1`, `esi-search.search_structures.v1`. **Rebuild (Stage 17.1): dropped ESI resolution** — ESI only returns own-corp structures, so intel on other corps' structures is **manual entry** into `ap_structure`. See `docs/plans/rebuild-roadmap.md` Stage 17. |
| ESI: corp membership | per-user | — | server | character | — | ESI | `esi-corporations.read_corporation_membership.v1` |
| ESI: clones | per-user | — | server | — | — | ESI | `esi-clones.read_clones.v1` |
| ESI: corp roles | per-user | — | server | character | — | ESI | `esi-characters.read_corporation_roles.v1` |
| Sovereignty data sync | global | — | server cron | system_sov | `updateSovereigntyData` (30 past hr) | ESI | → E |
| System data import | global | — | server cron | system | `importSystemData` (30 past hr) | ESI | → E |
| Universe systems update | global | — | server cron | (universe) | `updateUniverseSystems` ✗ disabled | ESI | WIP |
| zKillboard kill stats | per-system | killboard module | server | — | — | zKillboard | `[PATHFINDER.API].Z_KILLBOARD` |
| EVE-Scout Thera | global | `module/global_thera.js`, `dialog/structure.html`? | `/api/rest/SystemThera` | — | — | EVE-Scout | `[PATHFINDER.API].EVE_SCOUT` |
| DOTLAN deep links | per-system | `module/dotlan.js` | — | — | — | DOTLAN | plugin, `[PATHFINDER.API].DOTLAN` |
| Anoik.is links | per-system | tooltips | — | — | — | Anoik | `[PATHFINDER.API].ANOIK` |
| EVEEYE links | per-system | links | — | — | — | EVEEYE | `[PATHFINDER.API].EVEEYE` |
| CCP image server (portraits etc.) | global | `modules/lazy_image.html`, `tooltip/character_info.html` | — | — | — | CCP images | `[PATHFINDER.API].CCP_IMAGE_SERVER` |
| GitHub changelog | global | changelog dialog | `/api/GitHub/*` | — | — | GitHub | `[PATHFINDER.API].GIT_HUB` |
| Outbound SMTP | server | — | — | — | — | SMTP | `[ENVIRONMENT.*].SMTP_*` |

## 10. Permissions & access control

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Roles (MEMBER / CORPORATION / SUPER) | global | admin | — (resolved at login) | role | — | — | [09 § Roles](09-permissions-and-admin.md#roles) |
| Rights (map_*: create/update/delete/import/export/share) | global | admin settings | (per-action checks; admin edits via `/admin/settings/save/<corpId>`) | right, corporation_right | — | — | [09 § Rights](09-permissions-and-admin.md#rights) |
| Map access lists (char/corp/alliance) | per-map | map settings dialog | `/api/Access/search`, `PATCH /api/rest/Map/<id>` | character_map, corporation_map, alliance_map | — | — | [09 § Map access control](09-permissions-and-admin.md#map-access-control) |
| Character status (per-map: corporation/alliance/own) | per-user | header / local | server | character_status, character_map | — | — | [09 § Character statuses](09-permissions-and-admin.md#character-statuses) |
| Admin gate (role + admin ESI scopes) | global | — | `Controller\Admin->dispatch` | role | — | — | [09 § Admin panel](09-permissions-and-admin.md#admin-panel----admin) |
| Kick character (5m / 1h / 24h timeout) | corp/super | `admin/members.html` | `GET /admin/members/kick/<id>/<min>` | character | — | — | [09 § Character statuses](09-permissions-and-admin.md#character-statuses); GET-only, no CSRF |
| Ban character | corp/super | `admin/members.html` | `GET /admin/members/ban/<id>/<value>` | character | — | — | [09 § Character statuses](09-permissions-and-admin.md#character-statuses); GET-only, no CSRF |
| Admin map activate/deactivate | corp/super | `admin/maps.html` | `GET /admin/maps/active/<id>/<value>` | map | — | — | [09 § Admin panel](09-permissions-and-admin.md#admin-panel----admin) |
| Admin hard-delete map | corp/super | `admin/maps.html` | `GET /admin/maps/delete/<id>` | map | — | — | bypasses cron soft-delete; [09](09-permissions-and-admin.md#admin-panel----admin) |
| Corporation right config | corp/super | `admin/settings.html` | `GET /admin/settings/save/<corpId>` | corporation_right | — | — | [09 § Rights](09-permissions-and-admin.md#rights) |

## 11. Logging & history

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Activity log (map-scoped) | per-map | stats dialog | — | activity_log | `deleteStatisticsData` (weekly) | — | `LOG_ACTIVITY_ENABLED` per scope |
| Map history NDJSON | per-map | log dialog | `/api/rest/Log` | — (files in `history/`) | `truncateMapHistoryLogFiles` (30m) | — | `LOG_HISTORY_ENABLED` per scope; thresholds `LOG_SIZE_THRESHOLD=2MB`, `LOG_LINES=1000` |
| Monolog channels | server | — | — | — | — | — | `logs/{error,sso,character_login,character_access,session_suspect,account_delete,admin,socket_error,debug}.log` |
| Suspect-session detection | server | — | — | session | — | — | logs `session_suspect.log`; details TBD |

## 12. Caching

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Filesystem cache | server | — | — | — | `deleteExpiredCacheData` (downtime) | — | `tmp/cache/`; default |
| Redis cache | server | — | — | — | `deleteExpiredCacheData` | — | optional, `CACHE` override |
| MySQL-backed sessions | server | — | — | sessions | — | — | `SESSION_CACHE=mysql` |
| Per-domain TTLs | server | — | — | — | — | — | `[PATHFINDER.CACHE]`: characters, connections, signatures |
| Socket-availability cache | server | — | — | — | — | — | 60s TTL on `validSocketConnect` |

## 13. UI shell & ergonomics

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Header / character panel | per-user | `layout/header_map.html`, `ui/character_panel.html` | — | — | — | — | |
| Footer | per-page | `layout/footer_map.html`, `layout/footer_simple.html` | — | — | — | — | |
| Splash / loading | global | `layout/splash.html` | — | — | — | — | |
| Status pages 4xx/5xx | global | `status/4xx.html`, `status/5xx.html`, `status/offline.html` | — | — | — | — | `[PATHFINDER.STATUS]` |
| Module dock around map | per-map | `js/app/map/module_map.js` | — | — | — | — | → G/H |
| Keyboard shortcuts | per-user | `js/app/key.js`, `dialog/shortcuts.html` | — | — | — | — | |
| Task manager | per-user | `dialog/task_manager.html` | — | — | — | — | concurrent client tasks |
| Gallery dialog | global | `dialog/gallery.html` | — | — | — | — | |
| Server panel (status) | admin | `ui/server_panel.html` | — | — | — | — | |
| Cron table (admin) | admin | `ui/cron_table_row.html` | — | — | — | — | |
| Notice / banner | global | `ui/notice.html`, `ui/info_panel.html` | — | — | — | — | |
| Debug panel | dev | `ui/debug.html` | — | — | — | — | `DEBUG≥1` |
| JSON-LD page metadata | global | `ui/jsonld.html` | — | — | — | — | SEO |

## 14. Build & assets

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Gulp asset pipeline | build | — | — | — | — | — | `gulpfile.js`; outputs versioned `public/{js,css,img}/v<version>/` |
| RequireJS bundles | build | — | — | — | — | — | `login`, `mappage`, `setup`, `admin`, loaders |
| Pre-compressed gz/br | build | — | — | — | — | — | served by web layer |
| Header image responsive set | build | — | — | — | — | — | `[480, 780, 1200, 1600, 3840]px` + WebP |

## 15. Disabled / WIP / open

- `updateUniverseSystems` cron (`Cron\Universe`) — commented in `cron.ini`. ✗
- `setup` cron (`Cron\Universe`) — commented in `cron.ini`. ✗
- `SEND_RALLY_Mail_ENABLED` — ships disabled for all scopes by default. ?
- `DB_CCP_*` env block in `environment.ini` — wired but apparently unused. ?
- `CCP_ESI_SCOPES_ADMIN` — empty by default. ?
- `[PATHFINDER.EXPERIMENTS] PERSISTENT_DB_CONNECTIONS = 1` — flagged experimental.
- `SOCKET_HOST` / `SOCKET_PORT` — not in shipped `environment.ini` but read by `Lib\Config`. Realtime won't work without them. → D

---

## Self-check (Stage A)

- [x] Every `app/*.ini` file read end-to-end and documented in [01-config-and-deployment.md](01-config-and-deployment.md).
- [x] `index.php`, `Lib/Config.php`, `Controller/AppController.php`, `composer.json`, `package.json`, `gulpfile.js` read and summarised.
- [x] Glossary of EVE terms captured in [00-overview.md](00-overview.md).
- [x] Feature matrix skeleton enumerates UI surfaces from `js/app/ui/dialog/`, `js/app/ui/module/`, `public/templates/**`, routes, cron jobs, and `pathfinder.ini` flags.
- [x] Open questions appended to each Stage-A doc.

## Open questions (Stage A)

See the bottom of [00-overview.md](00-overview.md) and [01-config-and-deployment.md](01-config-and-deployment.md). Stage I will close them out alongside the rest of the spec.

---

## Stage C update

Stage C added [03-backend-api.md](03-backend-api.md) and [09-permissions-and-admin.md](09-permissions-and-admin.md). Permissions / admin rows above were rewritten; SSO and account rows were linked to the new doc.

### API endpoint coverage (Stage C)

Every controller action listed in [03-backend-api.md](03-backend-api.md) covers:

- 5 page routes: `/`, `/setup`, `/sso/*`, `/map*`, `/admin*`
- 26 AJAX actions across 8 `Api\*` controllers (`Access`, `GitHub`, `Map`, `Setup`, `Statistic`, `System`, `Universe`, `User`)
- 30+ REST verbs across 11 `Api\Rest\*` resource controllers (`Connection`, `Log`, `Map`, `Route`, `Signature`, `SignatureHistory`, `Structure`, `System`, `SystemGraph`, `SystemSearch`, `SystemThera`)
- 1 beacon endpoint: `POST /api/Map/updateUnloadData`

### Stage C self-check

- [x] Every file under `app/Controller/` read and summarised (page controllers, `Api/*`, `Api/Rest/*`, `Ccp/Sso`).
- [x] Every public action method appears in [03-backend-api.md](03-backend-api.md).
- [x] Every right in `RightModel` and role in `RoleModel` appears in [09-permissions-and-admin.md](09-permissions-and-admin.md).
- [x] Admin dispatch table fully enumerated.
- [x] Cross-links to [02-data-model.md](02-data-model.md) for model references.
- [x] Open questions list non-empty (six in 03, seven in 09).
- [x] Feature matrix updated — auth, account, and permission rows now link forward to Stage C docs; admin action rows added.

Stage E will pick up the SSO OAuth2 flow internals, ESI endpoint inventory, GitHub changelog plumbing, and outbound mail; Stage D will pick up the WebSocket transport used by `Api\Map::getAccessData` / `updateData` / `updateUserData`.

---

## Stage D update

Stage D added [04-cron-and-background.md](04-cron-and-background.md). All cron-job and realtime-transport rows in the matrix above are now backed by that doc.

### Cron coverage (Stage D)

13 active jobs across 6 classes:

- `Cron\MapUpdate` — `deactivateMapData` (@hourly), `deleteMapData` (@downtime), `deleteEolConnections` (@5m), `deleteExpiredConnections` (@hourly), `deleteSignatures` (@30m)
- `Cron\CharacterUpdate` — `deleteLogData` (@instant), `cleanUpCharacterData` (@hourly), `deleteAuthenticationData` (@downtime)
- `Cron\Cache` — `deleteExpiredCacheData` (@downtime)
- `Cron\StatisticsUpdate` — `deleteStatisticsData` (@weekly)
- `Cron\MapHistory` — `truncateMapHistoryLogFiles` (@30m)
- `Cron\CcpSystemsUpdate` — `importSystemData` (@halfPastHour)
- `Cron\Universe` — `updateSovereigntyData` (@halfPastHour); plus disabled `updateUniverseSystems`, `setup`

### Realtime transport coverage (Stage D)

- PHP client (`Lib\Socket\{AbstractSocket,TcpSocket,NullSocket,SocketInterface}`) + factory binding in `Lib\Config`.
- Browser SharedWorker (`js/app/map/worker.js`, `js/app/worker/map.js`) and `MsgWorker` envelope.
- Server-side socket-server process: out of this repo (noted as open question 1 in Stage D).
- Task vocabulary catalogued: `mapUpdate`, `mapAccess`, `mapConnectionAccess`, `mapDeleted`, `characterUpdate`, `characterLogout`, `healthCheck`, `logData` (+ client→server `subscribe` / `unsubscribe`).

### Stage D self-check

- [x] Every job in `cron.ini` appears in [04-cron-and-background.md](04-cron-and-background.md), including the two commented-out WIP jobs.
- [x] Every `app/Cron/*.php` file read.
- [x] Every `app/Lib/Socket/*.php` file read.
- [x] All `$f3->webSocket()->write(` call sites in `app/` enumerated to derive the task vocabulary.
- [x] Map-history pipeline (Monolog → socket server → NDJSON files → truncate cron) traced end-to-end.
- [x] Per-request activity-log buffer flush (`LogController::logActivities` via `Controller::unload`) documented.
- [x] Open questions list non-empty (8 in 04).

---

## Stage E update

Stage E added [05-external-integrations.md](05-external-integrations.md). External-integration rows in the matrix above now link to it.

### External integration coverage (Stage E)

- **CCP SSO** — full OAuth2 + JWT flow (authorize → callback → token exchange → JWK verify → character upsert), refresh-token handling on `CharacterModel::getAccessToken()`, cookie-based re-login, admin-scope variant.
- **CCP ESI** — full opKey → swagger `operationId` inventory (≈38 distinct call sites), grouped by call site (SSO callback, character poll, route/autopilot, structure resolve, universe upsert paths, sov/FW cron, static-data setup).
- **EVE-Scout** — single `getTheraConnections` endpoint, verbose-logging quirk documented.
- **GitHub API** — `getProjectReleases` + `markdownToHtml`; quirks (repo-slug mismatch, body truncation, unauthenticated rate limit).
- **Outbound mail** — SwiftMailer / SMTP wiring through Monolog `mail` handler, `templates/mail/basic*.html`; noted that nothing in tree currently subscribes the `mail` handler.
- **Static-data import** — SQL dump + Pochven/Zarzakh patch SQLs + ESI walking via `Cron\Universe::setup` + `Ccp\Universe::setupCategory/Group`.

### Stage E self-check

- [x] Every file under `app/Lib/Api/` read.
- [x] `app/Controller/Ccp/Sso.php` and `app/Controller/Ccp/Universe.php` walked end-to-end.
- [x] `app/Controller/Api/GitHub.php` documented.
- [x] Every `*Client()->send(...)` call site in `app/` accounted for in §3.1 / §4 / §5 of [05](05-external-integrations.md).
- [x] Mail template files in `public/templates/mail/` read and variable list captured.
- [x] `export/sql/`, `export/csv/` contents and patch-SQL purpose documented.
- [x] `vendor/monoliyoda/pathfinder_esi` is not present in tree — flagged as Open Question 1 in [05](05-external-integrations.md).
- [x] Open questions list non-empty (5 in 05).

---

## Stage F update

Stage F added [06-frontend-architecture.md](06-frontend-architecture.md). It deferred matrix updates to Stage I; the rows below are now backed by it. Existing rows in §13 / §14 already cover the "Task Manager" and "RequireJS bundles" entries — only the truly new surfaces are added.

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Slidebars off-canvas menus (left/right) | per-user | `js/app/page.js`, Slidebars 2.0.2 | — | — | — | — | left menu = nav; right menu = map view toggles (grid snap, magnetizer, compact, labels, signature overlays) → [06 § Page chrome](06-frontend-architecture.md) |
| Performance logging dialog | per-user | `dialog/task_manager.html`, `js/app/counter.js`, `js/app/logging.js` | — (client only) | — | — | — | shows in-flight request counters; gated by `Init.performanceLogging` → [06](06-frontend-architecture.md) |
| Asset cache-busting via versioned paths | build | — | — | — | — | — | `public/{js,css,img}/v<version>/`; bumps every release → [06](06-frontend-architecture.md) |
| Loader bundles (pnotify / datatables / summernote) | build | — | — | — | — | — | RequireJS shim bundles → [06](06-frontend-architecture.md) |

## Stage G update

Stage G added [07-frontend-map-engine.md](07-frontend-map-engine.md). All `→ G` markers in the matrix above are now resolved against `07-frontend-map-engine.md`; treat any "→ G" cell as a link to the matching section there (Map lifecycle, System lifecycle, Connection lifecycle, Auxiliary modules). New auxiliary-feature rows:

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Map overlay system (route / intel / debug) | per-map | `js/app/map/overlay/*.js` | — (client) | — | — | — | toggled from right Slidebar → [07 § Auxiliary modules](07-frontend-map-engine.md#auxiliary-modules) |
| Drag-select marquee (multi-system selection) | per-map | `js/app/lib/dragSelect.js` | — | — | — | — | enables bulk move / context-menu actions → [07](07-frontend-map-engine.md) |
| Custom scrollbar on map canvas | per-map | `js/app/map/scrollbar.js` | — | — | — | — | → [07](07-frontend-map-engine.md) |
| Background contextmenu (paste systems / new connection mode) | per-map | `js/app/map/contextmenu.js` | `/api/Map/*` | system | — | — | → [07](07-frontend-map-engine.md) |

## Stage H update

Stage H added [08-frontend-ui-modules.md](08-frontend-ui-modules.md). All `→ H` markers above resolve into the per-module / per-dialog sections of that doc. Additional rows that Stage H surfaced and that were not yet enumerated in the skeleton:

| Feature | Scope | UI | API | DB | Cron | Ext | Status |
|---|---|---|---|---|---|---|---|
| Map import / export (JSON download / upload) | per-map | map settings dialog | `/api/Map/importMap`, `/api/Map/export*` (see [03](03-backend-api.md)) | map, system, connection, signature | — | — | rights: `map_import`, `map_export` → [08](08-frontend-ui-modules.md), [09](09-permissions-and-admin.md) |
| Statistics dashboard (per-character / per-corp activity) | per-user | `dialog/stats.js`, `dialog/stats.html` | `/api/Statistic/*` | activity_log | `deleteStatisticsData` (weekly) | — | → [08](08-frontend-ui-modules.md) |
| Structure intel module | per-system | `dialog/structure.html`, `module/system_info.js` | `/api/rest/Structure` | structure | — | ESI structures | → [08](08-frontend-ui-modules.md), [05](05-external-integrations.md) |
| User-config save (per-character UI prefs) | per-user | various modules | `/api/User/saveUserConfig` (see [03](03-backend-api.md)) | character | — | — | persists module layout, expanded sections → [08](08-frontend-ui-modules.md) |
| `header_login.js` canvas physics splash | global | login page | — | — | — | — | ~600 LOC of visual flourish; flagged "drop in rebuild" → [08](08-frontend-ui-modules.md#open-questions) |
| Plugin module loading (`BaseModule.isPlugin`) | per-map | `module/empty.js` template | — | — | — | — | ✗ scaffolding only; no plugins wired in build → [08](08-frontend-ui-modules.md#open-questions) |

---

## Stage I — Cross-reference audit

Stage I closes out the matrix. Its job is verification, not new prose: walk every prior doc, mark forward references as resolved, consolidate open questions, and stamp the dead-code / footgun inventory.

### Forward references resolved

| Marker in matrix | Resolved by |
|---|---|
| `→ G` (Stage G) | [07-frontend-map-engine.md](07-frontend-map-engine.md) |
| `→ H` (Stage H) | [08-frontend-ui-modules.md](08-frontend-ui-modules.md) |
| `→ D` (Stage D) | [04-cron-and-background.md](04-cron-and-background.md) |
| `→ E` (Stage E) | [05-external-integrations.md](05-external-integrations.md) |
| `details TBD` on suspect-session detection | Resolved: Monolog `session_suspect` channel is written by `Lib\Monolog\Handler` paths invoked from `Controller\AppController::initResource`; no UI consumer — log-only. Update row: drop `TBD`. |

### Open-question audit

Source docs collectively raised **47** open questions (00:5, 01:6, 02:7, 03:6, 04:8, 05:5, 06:5, 07:6, 08:8, 09:7). Inline `**A:**` answers (provided by the user during earlier stages) resolve **11** of them. The remainder fall into three categories:

**Resolved during Stage I (inline answers in source docs):**
- [00] Deployment scope (self-hosted by EVE groups).
- [00] `monoliyoda/pathfinder_esi` provenance (ad-hoc patches, no upstream changelog).
- [01] `pathfinder_env` switch lives in `conf/` overrides.
- [01] `conf/` is deploy-time, not committed.
- [01] EVE-Scout v2 schema validated.
- [01] Gulp build still works on modern Node.
- [02] Pochven / Abyssal labels added post-launch as patch — explains undocumented enums.
- [02] Stale `Universe/Structure` rows on token loss → intended ("keep stale data" is desirable).
- [03] `/setup` is fronted by HTTP Basic Auth at the proxy; SSO not required by design.
- [04] Socket server lives in `KitchenSinkhole/pathfinder_websocket`, optional at deploy.
- [04] `importSystemData` 24-column rotation = 24 hourly ESI buckets.
- [09] Same answer as [03] regarding `/setup`.

**Still open — should be answered before rebuild:**
1. **DB_CCP_* env block** — confirmed unused after Stage E grep ([00] + [01] + [02]). Recommend removing in rebuild rather than carrying forward.
2. **`Lib\Config::pingDomain`** — appears dead; no callers found. Confirm with `git log -S` before deleting.
3. **WebSocket `subscribe` / `stats` / `healthCheck` payload shapes** ([04] Q2–Q4) — need to be lifted from the external `pathfinder_websocket` repo. Blocking for a TypeScript transport in the rebuild.
4. **`refreshAccessToken` rotation** ([05] Q3) — `CharacterModel::getAccessToken()` does not persist a rotated `esiRefreshToken`. If CCP starts rotating, Pathfinder will silently degrade. **High-priority bug suspect.**
5. **`searchUniverseNameData` scope coverage** ([05] Q2) — only `search_structures` scope is granted but other categories may be queried.
6. **Vendor opKey ↔ swagger op mapping** ([05] Q1) — diff against `KitchenSinkhole/pathfinder_esi` before the rebuild commits to a TS ESI client.
7. **Map history file purge** ([04] Q6) — `history/map/map_<id>.log` is not cleaned when a map is hard-deleted; files accumulate indefinitely. **Confirmed leak.**
8. **`map_share` / `map_import` / `map_export` server-side enforcement** ([09] Q1) — UI gates the action but server-side check needs verification per controller; potential bypass.
9. **Cookie SameSite / Secure flags** ([09] Q6) — no-CSRF posture depends on these being set at the proxy.
10. **Kick / ban orphaning on account delete** ([09] Q7).
11. **Activity-log retention week-rollover** ([04] Q7) — minor; ≤53-week retention in ISO53 years.

**Non-blocking / nice-to-have:** all remaining frontend questions (06 × 4, 07 × 6, 08 × 8) are implementation curiosities the rebuild will naturally answer by replacing the relevant code.

### Dead / disabled / WIP inventory

Consolidated from §15 above plus findings in later stages:

| Item | Where | Disposition for rebuild |
|---|---|---|
| `Cron\Universe::updateUniverseSystems` | commented in [`cron.ini`](../../app/cron.ini); class still present | ✗ Drop — historical WIP that never shipped |
| `Cron\Universe::setup` | commented in [`cron.ini`](../../app/cron.ini) | Keep behavior — one-shot static-data bootstrap; trigger via deploy script, not cron |
| `SEND_RALLY_Mail_ENABLED` (per-scope) | [`pathfinder.ini`](../../app/pathfinder.ini); all scopes default 0 | ✗ Drop SwiftMailer + Monolog mail handler; replace with webhook-only ([05](05-external-integrations.md)) |
| `DB_CCP_*` DSN block | [`environment.ini`](../../app/environment.ini); no readers | ✗ Drop |
| `CCP_ESI_SCOPES_ADMIN` (empty default) | [`pathfinder.ini`](../../app/pathfinder.ini) | Decide: either populate with a real admin-scope set or remove the admin-scope gate ([09](09-permissions-and-admin.md#admin-panel----admin)) |
| `[PATHFINDER.EXPERIMENTS] PERSISTENT_DB_CONNECTIONS = 1` | [`pathfinder.ini`](../../app/pathfinder.ini); explicitly experimental | Re-evaluate against PgBouncer / Prisma connection pooling in the rebuild |
| `Lib\Config::pingDomain` | [`Lib/Config.php`](../../app/Lib/Config.php) | ✗ Drop if grep confirms no callers |
| `BaseModule.isPlugin` + `module/empty.js` | `js/app/ui/module/empty.js` | ✗ Drop; never wired into build |
| `header_login.js` canvas physics | `js/app/ui/header_login.js` | Drop in rebuild — purely decorative |
| `Position.findNonOverlappingDimensions` `findChain:true` branch | `js/app/map/util.js` | Likely dead; confirm before deleting |
| `?debug` overlay system | `js/app/map/overlay/overlay.js:709-804` | Keep as dev-only; document toggles |
| Hard-deleted map history files | `history/map/map_<id>.log` | **Bug** — add cleanup hook in rebuild |
| Mail templates under [`public/templates/mail/`](../../public/templates/mail) | rendered but never sent in shipped config | Drop with SwiftMailer |
| `SOCKET_HOST` / `SOCKET_PORT` missing from `environment.ini` | [`Lib/Config.php`](../../app/Lib/Config.php) reads them | Document as required deploy-time env in rebuild; current behavior silently no-ops realtime |

### CCP-API footgun history

EVE-specific quirks the rebuild must inherit consciously:

1. **ESI shape churn.** Why `monoliyoda/pathfinder_esi` is a forked vendor — upstream stalls behind CCP changes. Every ESI call site is "as currently observed" ([00 § Quirks](00-overview.md)).
2. **SSO v2 refresh-token rotation.** Pathfinder does not persist rotated refresh tokens (see Q4 above). If CCP enables rotation, sessions die after one refresh.
3. **JWK key rotation** on the SSO endpoint. `Sso::verifyAccessToken` re-fetches JWKs per validation; cache invalidation has bitten production in the past — preserve the no-cache stance or wire conditional re-fetch.
4. **Static-data drift.** Pochven (region 10000070) and Zarzakh (system 30000003 / 30100000) were grafted onto the schema via [`export/sql/`](../../export/sql/) patches. Any future CCP space addition needs the same dance. Stage E recommends switching the rebuild to streaming SDE + ESI deltas.
5. **Structure search** requires character-scoped tokens, and structure names disappear when the only authorized character leaves. Pathfinder's "keep stale" stance is intentional but produces ghost rows ([02 Q on `Universe/Structure`](02-data-model.md#23-open-questions)).
6. **ESI search categories.** `esi-search.search_structures.v1` is currently the only structure-search scope granted, but `searchUniverseNameData` paths likely also hit non-structure categories ([05 Q2](05-external-integrations.md#open-questions)).
7. **Cookie-based re-login** uses a selector+validator pair whose on-wire format is undocumented ([03 Q5](03-backend-api.md#open-questions)). Migrating to NextAuth without breaking existing "Remember me" cookies needs the exact format.
8. **`updateSovereigntyData`** chunks against ESI's pagination and persists `count` to resume — concurrent runs would double-import ([04 Q5](04-cron-and-background.md#open-questions)). The cron lock is the only thing keeping this safe.
9. **EVE-Scout v2 endpoint shape** changed between v1 and v2; the current integration was validated against v2 ([01 inline answer](01-config-and-deployment.md#open-questions)). Will likely change again.
10. **GitHub API rate limits.** [`Api\GitHub`](../../app/Controller/Api/GitHub.php) is unauthenticated; 60 req/h IP limit. Changelog dialog can dark-fail on busy hosts ([05](05-external-integrations.md)).
11. **`clue/ndjson-react` socket transport** lives in a separate optional repo. Without it, all `→ D` realtime features silently no-op and the user sees stale maps with no error.

### Coverage summary

| Stage | Output | Critical files read | Public entry points covered | Open questions raised | Resolved by Stage I |
|---|---|---|---|---|---|
| A | 00, 01, 10 skeleton | ✓ all ini, bootstrap, Config, AppController, gulpfile | all routes, dialogs, modules listed | 5 + 6 = 11 | 7 |
| B | 02 | ✓ Abstract*, all 35 + 22 models, Db/, export/sql | every model class | 7 | 2 |
| C | 03, 09 | ✓ all controllers | every action method, every right & role | 6 + 7 = 13 | 2 |
| D | 04 | ✓ all crons, all Lib/Socket | 13 cron jobs, 8 socket tasks | 8 | 2 |
| E | 05 | ✓ all Lib/Api, Ccp/*, GitHub controller, mail templates, export SQL | ~38 ESI opKeys, SSO flow, GitHub, mail, static import | 5 | 0 (all carried) |
| F | 06 | ✓ all page entrypoints, workers, build | 4 pages, 3 loaders, SharedWorker | 5 | 0 |
| G | 07 | ✓ all map/* files, module_map | Map / System / Connection / overlay APIs | 6 | 0 |
| H | 08 | ✓ all ui/dialog (13), ui/module (13), templates | every dialog, every module, templates inventory | 8 | 0 |
| I | (this section) | — | — | — | resolved 11 of 47; 11 remain blocking, 25 deferred to rebuild |

### Stage I self-check

- [x] Every `→ G`, `→ H`, `→ D`, `→ E` marker in the matrix points to an existing section.
- [x] Stage F/G/H deferred-row backlog appended above.
- [x] Each prior stage's open-question list re-read; resolved questions tagged, unresolved promoted to a numbered list above.
- [x] Dead code / disabled features inventoried with explicit rebuild disposition.
- [x] CCP-API footgun list captured for the rebuild team.
- [x] Coverage table cross-references every prior stage's self-check.
- [x] No new prose docs written — Stage I is audit-only by design; substantive content stays in the originating stage docs.

### Hand-off to Stage J

Stage J (rebuild spec) can now treat this matrix as the canonical feature inventory:

- **Keep:** every row in §§1–14 not flagged ✗ above.
- **Drop:** all rows / items in the dead-code table above.
- **Redesign:** realtime transport (move off TCP+NDJSON to native WebSockets / SSE), static-data sync (move off SQL-dump + ESI walk to streaming SDE + ESI deltas), SSO (NextAuth provider with persisted refresh-token rotation), auth cookies (re-issue under new format with a migration window).
- **Open before commit:** the 11 still-open questions above.

---

## Stage J update

Stage J assembled the rebuild specification at [SPEC.md](SPEC.md). It treats the hand-off block above as canonical (no rows added or moved here), and consolidates Keep / Drop / Redesign + phased migration + open-question resolution in the new doc. From this point on, the rebuild team's entry point is [SPEC.md](SPEC.md); §§1–14 above remain the source-of-truth feature inventory it points back at.
