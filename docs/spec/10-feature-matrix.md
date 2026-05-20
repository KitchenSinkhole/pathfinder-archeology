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
| ESI: structure resolution | per-system | structure dialog | `/api/rest/Structure` | structure | — | ESI | `esi-universe.read_structures.v1`, `esi-search.search_structures.v1` |
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
