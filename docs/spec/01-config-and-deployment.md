# 01 — Configuration & Deployment

**Stage A output.** Companion to [00-overview.md](00-overview.md). The feature matrix at [10-feature-matrix.md](10-feature-matrix.md) cross-references every flag documented here.

## Purpose

Document every configuration surface the application has: the seven `*.ini` files under `app/`, the conventions for site-local overrides under `conf/`, the bootstrap and config-loader code that interprets them, the cache and logging backends they configure, and the deployment-time runtime topology (web tier, DBs, socket server, cron).

## Surface area

Config files loaded by `index.php` → `app/config.ini` → cascading `[configs]`:

| File                   | Purpose                                                                                               | Override path                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/config.ini`       | Fat-Free Framework globals, paths, cascade list.                                                      | — (in-repo only)                                                                        |
| `app/environment.ini`  | Per-environment DB/SSO/ESI/SMTP credentials. **Defines environment switch (`DEVELOP`/`PRODUCTION`).** | `conf/environment.ini` (per recent commit `37b96bb1` — site-local secrets belong here). |
| `app/routes.ini`       | URL → controller mappings.                                                                            | —                                                                                       |
| `app/pathfinder.ini`   | Application feature flags & limits.                                                                   | `conf/pathfinder.ini` (loaded after default).                                           |
| `app/plugin.ini`       | UI plugin registry.                                                                                   | `conf/plugin.ini` (loaded after default).                                               |
| `app/requirements.ini` | Runtime version + ini-setting requirements, MySQL session vars.                                       | —                                                                                       |
| `app/cron.ini`         | Scheduled job definitions.                                                                            | —                                                                                       |

Override mechanics: `app/config.ini` `[configs]` lists each file with a `true` flag. The default copies under `app/` are loaded first; `conf/pathfinder.ini` and `conf/plugin.ini` are then loaded and **shallow-overwrite** the defaults (F3 `$f3->config()` semantics — later keys win at the section level).

## Bootstrap and config loading

### `index.php`

```php
session_name('pathfinder_session');
require_once 'vendor/autoload.php';     // hard-fails if missing
$f3 = \Base::instance();
$f3->set('NAMESPACE', __NAMESPACE__);    // Exodus4D\Pathfinder
$f3->config('app/config.ini', true);     // loads cascade
Lib\Config::instance($f3);               // env detection, DBs, API clients
Lib\Cron::instance();                    // registers jobs from cron.ini
$f3->run();
```

The session cookie name is fixed to `pathfinder_session`. The autoloader is required — there is no fallback path.

### [Lib\\Config](../../app/Lib/Config.php)

Singleton. Responsibilities, in order called by the constructor:

1. **Environment selection.** Reads `ENVIRONMENT.SERVER` from `environment.ini` (set to `PRODUCTION` by default; a deploy switches it or sets `pathfinder_env` server env var). Copies `ENVIRONMENT.<NAME>` block keys onto the F3 hive so they are accessible as `@DB_PF_NAME`, `@CCP_SSO_URL`, etc.
2. **DB pool.** For each DSN alias (`PF`, `UNIVERSE`, optionally `CCP`):
   - `getDatabaseConfig()` parses the DSN, merges host/port/socket/db/credentials with defaults.
   - Persistent connections are toggled by `pathfinder.ini` `[PATHFINDER.EXPERIMENTS] PERSISTENT_DB_CONNECTIONS = 1`.
   - On connect, MySQL session variables from `[REQUIREMENTS.MYSQL.VARS]` are applied (storage engine, charset stack, FK checks, timeouts).
3. **API clients (lazy).** SSO, CCP/ESI, GitHub, Eve-Scout. URLs come from `environment.ini` / `pathfinder.ini` `[PATHFINDER.API]`.
4. **Socket pre-check.** `validSocketConnect()` does a TCP open to `getSocketUri()` with 60s positive cache, so request-time emits short-circuit when the realtime server is down.

Public helpers worth knowing (called widely from controllers):

| Method                                        | Returns                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ | ----------- | ----------------------------------- |
| `getEnvironmentData($key)`                    | Single env value from the active `[ENVIRONMENT.*]` block.          |
| `getPathfinderData($key)`                     | Dot-path lookup in `[PATHFINDER.*]`.                               |
| `getDatabaseConfig($f3, $alias)`              | Parsed DSN + opts for `PF` / `UNIVERSE` / `CCP`.                   |
| `getRequiredDbVars($f3, $schema)`             | MySQL session vars from requirements.ini.                          |
| `getSMTPConfig()` / `isValidSMTPConfig($cfg)` | Mail config + sanity check.                                        |
| `getNotificationMail($key)`                   | Resolved mail address.                                             |
| `getMapsDefaultConfig($mapType)`              | The `[PATHFINDER.MAP.PRIVATE                                       | CORPORATION | ALLIANCE]`block matching`$mapType`. |
| `getPluginConfig($key, $checkEnabled)`        | Plugin entries from `plugin.ini`.                                  |
| `validSocketConnect($uri)`                    | True if realtime socket reachable (cached).                        |
| `pingDomain($domain, $port)`                  | Latency probe in ms. (Possibly dead — see Stage A open questions.) |
| `getSocketUri()`                              | Assembles `tcp://HOST:PORT` from env.                              |
| `inDownTimeRange($dt)`                        | True when `$dt` is within CCP downtime window ±8m + 1m buffer.     |
| `parseDSN($dsn)`                              | Generic DSN parser used for cache/redis URIs.                      |
| `formatTimeInterval($seconds)`                | Pretty `Xd Yh Zm Zs`.                                              |
| `withNamespace($class)`                       | Prepends `Exodus4D\Pathfinder\`.                                   |

Constants:

```
PREFIX_KEY                = 'PF'           // namespace prefix for cache keys
ARRAY_DELIMITER           = '-'
HIVE_KEY_PATHFINDER       = 'PATHFINDER'
HIVE_KEY_ENVIRONMENT      = 'ENVIRONMENT'
HIVE_KEY_PLUGIN           = 'PLUGIN'
DOWNTIME_LENGTH           = 8              // minutes
DOWNTIME_BUFFER           = 1              // minutes
CACHE_TTL_SOCKET_VALID    = 60             // seconds
REDIS_OPT_TIMEOUT         = 2              // seconds
ARRAY_KEYS                = ['CCP_ESI_SCOPES', 'CCP_ESI_SCOPES_ADMIN']
ESI_CATEGORY_STRUCTURE_ID = 65
ESI_CATEGORY_SHIP_ID      = 6
ESI_GROUP_WORMHOLE_ID     = 988
ESI_DOGMA_ATTRIBUTE_SCANWHSTRENGTH_ID = 1908
```

The two `ARRAY_KEYS` are parsed as comma-separated lists when read from `environment.ini`.

---

## `app/config.ini` — framework globals

```ini
[SERVER]
SERVER_NAME     = PATHFINDER

[globals]
DEBUG           = 0           ; F3 verbosity; overridden per-env
HALT            = FALSE
TZ              = UTC
LANGUAGE        = en-US
SEED            = {{ md5(@SERVER.SERVER_NAME) }}
CACHE           = folder=tmp/cache/
API_CACHE       = {{@CACHE}}
SESSION_CACHE   = mysql       ; sessions persisted to DB, not cache backend
ONERROR         = {{ @NAMESPACE }}\Controller\Controller->showError
UNLOAD          = {{ @NAMESPACE }}\Controller\Controller->unload

[paths]
TEMP            = tmp/        ; F3 template cache + scratch
LOGS            = logs/
UI              = public/
FAVICON         = favicon/
EXPORT          = export/
CONF.CUSTOM     = conf/
CONF.DEFAULT    = app/

[configs]
{{@CONF.DEFAULT}}routes.ini       = true
{{@CONF.DEFAULT}}pathfinder.ini   = true
{{@CONF.DEFAULT}}plugin.ini       = true
{{@CONF.CUSTOM}}pathfinder.ini    = true
{{@CONF.CUSTOM}}plugin.ini        = true
{{@CONF.DEFAULT}}requirements.ini = true
{{@CONF.DEFAULT}}cron.ini         = true
```

Notes:

- `CACHE` defaults to filesystem. To use Redis, override to a DSN like `redis=127.0.0.1:6379` (parsed by `Lib\Config::parseDSN`).
- `SESSION_CACHE = mysql` is independent of `CACHE` — sessions always go to MySQL regardless of cache backend.
- The cascade does **not** include `environment.ini`. That file is consumed directly by `Lib\Config`.

---

## `app/environment.ini` — environments

`[ENVIRONMENT] SERVER = PRODUCTION` selects which sub-block is active. The repo ships with two blocks: `ENVIRONMENT.DEVELOP` and `ENVIRONMENT.PRODUCTION`. **Site-local secrets should go in `conf/environment.ini`** (commit `37b96bb1`). For each, the full key set:

### `[ENVIRONMENT.DEVELOP]` (defaults)

| Key                    | Default                                  |
| ---------------------- | ---------------------------------------- |
| `BASE`                 | (auto)                                   |
| `URL`                  | `{{@SCHEME}}://local.pathfinder`         |
| `DEBUG`                | `3`                                      |
| `DB_PF_DNS`            | `mysql:host=localhost;port=3306;dbname=` |
| `DB_PF_NAME`           | `pathfinder`                             |
| `DB_PF_USER`           | `root`                                   |
| `DB_PF_PASS`           | _(empty)_                                |
| `DB_UNIVERSE_DNS`      | `mysql:host=localhost;port=3306;dbname=` |
| `DB_UNIVERSE_NAME`     | `eve_universe`                           |
| `DB_UNIVERSE_USER`     | `root`                                   |
| `DB_UNIVERSE_PASS`     | _(empty)_                                |
| `CCP_SSO_URL`          | `https://sisilogin.testeveonline.com`    |
| `CCP_SSO_CLIENT_ID`    | _(empty — must set)_                     |
| `CCP_SSO_SECRET_KEY`   | _(empty — must set)_                     |
| `CCP_SSO_JWK_CLAIM`    | `login.eveonline.com`                    |
| `CCP_SSO_DOWNTIME`     | `11:00`                                  |
| `CCP_ESI_URL`          | `https://esi.evetech.net`                |
| `CCP_ESI_DATASOURCE`   | `singularity`                            |
| `CCP_ESI_SCOPES`       | see [scopes list](#esi-scopes)           |
| `CCP_ESI_SCOPES_ADMIN` | _(empty)_                                |
| `SMTP_HOST`            | `localhost`                              |
| `SMTP_PORT`            | `25`                                     |
| `SMTP_SCHEME`          | `TLS`                                    |
| `SMTP_USER`            | `pathfinder`                             |
| `SMTP_PASS`            | `root`                                   |
| `SMTP_FROM`            | `pathfinder@localhost.com`               |
| `SMTP_ERROR`           | `pathfinder@localhost.com`               |

### `[ENVIRONMENT.PRODUCTION]`

Same key set as DEVELOP, with these differences:

| Key                                      | Production value                          |
| ---------------------------------------- | ----------------------------------------- |
| `URL`                                    | `{{@SCHEME}}://www.pathfinder-w.space`    |
| `DEBUG`                                  | `0`                                       |
| `DB_PF_NAME`, `DB_PF_USER`, `DB_PF_PASS` | **must be set** in `conf/environment.ini` |
| `DB_UNIVERSE_NAME/USER/PASS`             | **must be set**                           |
| `DB_CCP_DNS`                             | `mysql:host=localhost;port=3306;dbname=`  |
| `DB_CCP_NAME/USER/PASS`                  | (optional third DB — typically empty)     |
| `CCP_SSO_URL`                            | `https://login.eveonline.com`             |
| `CCP_ESI_DATASOURCE`                     | `tranquility`                             |
| `SMTP_USER`, `SMTP_PASS`                 | **must be set**                           |
| `SMTP_FROM`                              | `registration@pathfinder-w.space`         |
| `SMTP_ERROR`                             | `admin@pathfinder-w.space`                |

### ESI scopes

The default `CCP_ESI_SCOPES` value (comma-separated, parsed into array per `ARRAY_KEYS`):

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

`CCP_ESI_SCOPES_ADMIN` is empty by default — admins are granted by role, not by additional scopes.

### Socket / realtime env

`SOCKET_HOST` / `SOCKET_PORT` are expected to exist for `Lib\Config::getSocketUri()` to assemble a URI; they are **not** present in the shipped `environment.ini` and must be added in `conf/environment.ini` (or via real env vars). Stage D will close the loop on what listens on this socket.

---

## `app/pathfinder.ini` — application feature flags

Sectioned dump. Override at `conf/pathfinder.ini`.

### `[PATHFINDER]` — install metadata

| Key                        | Default                                 | Notes                               |
| -------------------------- | --------------------------------------- | ----------------------------------- |
| `NAME`                     | `Pathfinder`                            | shown in title bar                  |
| `VERSION`                  | `v2.2.3`                                | shipped version                     |
| `CONTACT`                  | `https://github.com/thump3d`            |                                     |
| `EMAIL`                    | _(empty)_                               |                                     |
| `REPO`                     | `https://github.com/thump3d/pathfinder` |                                     |
| `SHOW_SETUP_WARNING`       | `1`                                     | renders "setup not complete" banner |
| `SHOW_COMPLETE_LOGIN_PAGE` | `1`                                     | full landing vs. simple             |

### `[PATHFINDER.REGISTRATION]`

| `STATUS` | `1` | toggles registration UI |

### `[PATHFINDER.LOGIN]`

| Key                                      | Default   | Notes                                                                    |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `COOKIE_EXPIRE`                          | `30`      | days; "remember me" cookie TTL                                           |
| `MODE_MAINTENANCE`                       | `0`       | when `1`, only `CHARACTER`/`CORPORATION`/`ALLIANCE` whitelist may log in |
| `SESSION_SHARING`                        | `0`       | share session across subdomains                                          |
| `CHARACTER` / `CORPORATION` / `ALLIANCE` | _(empty)_ | comma-separated allow-lists used by maintenance mode                     |

### `[PATHFINDER.CHARACTER]`

| `AUTO_LOCATION_SELECT` | `1` | auto-jump map view to current system |

### `[PATHFINDER.SLACK]` / `[PATHFINDER.DISCORD]`

| `STATUS` | `1` | enables outbound webhook delivery per-platform |

Per-channel webhook URLs and channel IDs are stored **on each `Map` row** (not in INI). The INI only toggles the feature.

### `[PATHFINDER.VIEW]` — view templates

| `INDEX` | `templates/view/index.html` |
| `SETUP` | `templates/view/setup.html` |
| `LOGIN` | `templates/view/login.html` |
| `ADMIN` | `templates/view/admin.html` |

### `[PATHFINDER.STATUS]` — error pages

| `4XX` | `templates/status/4xx.html` |
| `5XX` | `templates/status/5xx.html` |

### `[PATHFINDER.MAP.PRIVATE]`, `[…CORPORATION]`, `[…ALLIANCE]`

Each scope is identical in keyset. Defaults:

| Key                                      | Private | Corporation | Alliance |
| ---------------------------------------- | ------- | ----------- | -------- |
| `LIFETIME` (days, `99999` = ∞)           | 60      | 99999       | 99999    |
| `MAX_COUNT` (per owner)                  | 3       | 5           | 4        |
| `MAX_SHARED` (other owners shareable to) | 10      | 4           | 2        |
| `MAX_SYSTEMS`                            | 50      | 100         | 100      |
| `LOG_ACTIVITY_ENABLED`                   | 1       | 1           | 0        |
| `LOG_HISTORY_ENABLED`                    | 1       | 1           | 1        |
| `SEND_HISTORY_SLACK_ENABLED`             | 0       | 1           | 1        |
| `SEND_RALLY_SLACK_ENABLED`               | 1       | 1           | 1        |
| `SEND_HISTORY_DISCORD_ENABLED`           | 0       | 1           | 1        |
| `SEND_RALLY_DISCORD_ENABLED`             | 1       | 1           | 1        |
| `SEND_RALLY_Mail_ENABLED`                | 0       | 0           | 0        |

These are _defaults_. Per-map overrides live in the `map` table and are managed by the map settings dialog.

### `[PATHFINDER.ROUTE]` — jump route planner

| `SEARCH_DEPTH` | `9000` | max BFS depth |
| `SEARCH_DEFAULT_COUNT` | `4` | default # of routes returned |
| `MAX_DEFAULT_COUNT` | `6` | hard cap |
| `LIMIT` | `8` | per-request route limit |

### `[PATHFINDER.NOTIFICATION]`

| `RALLY_SET` | _(empty)_ | recipient list for rally mail (deployment-specific) |

### `[PATHFINDER.TIMER]` — base timers (all ms)

| `LOGGED` | `480` | activity timer |
| `DBL_CLICK` | `250` | double-click detect window |
| `PROGRAM_STATUS_VISIBLE` | `5000` | status toast duration |

### `[PATHFINDER.TIMER.UPDATE_SERVER_MAP]`

| `DELAY` | `5000` | client→server map update interval |
| `EXECUTION_LIMIT` | `500` | server-side processing budget (ms) |

### `[PATHFINDER.TIMER.UPDATE_CLIENT_MAP]`

| `EXECUTION_LIMIT` | `100` |

### `[PATHFINDER.TIMER.UPDATE_SERVER_USER_DATA]`

| `DELAY` | `5000` |
| `EXECUTION_LIMIT` | `1000` |

### `[PATHFINDER.TIMER.UPDATE_CLIENT_USER_DATA]`

| `EXECUTION_LIMIT` | `100` |

### `[PATHFINDER.CACHE]` — cache TTLs (seconds)

| `CHARACTER_LOG_INACTIVE` | `180` |
| `EXPIRE_MAX` | `864000` (10 days) |
| `EXPIRE_CONNECTIONS_EOL` | `15300` (~4.25h) |
| `EXPIRE_CONNECTIONS_WH` | `172800` (48h) |
| `EXPIRE_SIGNATURES` | `259200` (72h) |

### `[PATHFINDER.LOGFILES]` — Monolog channel names (filenames, no ext)

| `ERROR` | `error` |
| `SSO` | `sso` |
| `CHARACTER_LOGIN` | `character_login` |
| `CHARACTER_ACCESS` | `character_access` |
| `SESSION_SUSPECT` | `session_suspect` |
| `DELETE_ACCOUNT` | `account_delete` |
| `ADMIN` | `admin` |
| `SOCKET_ERROR` | `socket_error` |
| `DEBUG` | `debug` |

Each becomes `logs/<name>.log`.

### `[PATHFINDER.HISTORY]` — map history NDJSON

| `CACHE` | `5` | seconds — write coalescing |
| `LOG` | `history/` | output dir |
| `LOG_SIZE_THRESHOLD` | `2` | MB before truncation |
| `LOG_LINES` | `1000` | retained lines on truncation |

`Cron\MapHistory::truncateMapHistoryLogFiles` enforces these.

### `[PATHFINDER.API]` — third-party API base URLs

| `CCP_IMAGE_SERVER` | `https://images.evetech.net` |
| `Z_KILLBOARD` | `https://zkillboard.com/api` |
| `EVEEYE` | `https://eveeye.com` |
| `DOTLAN` | `http://evemaps.dotlan.net` |
| `ANOIK` | `http://anoik.is` |
| `EVE_SCOUT` | `https://api.eve-scout.com/v2/public` |
| `GIT_HUB` | `https://api.github.com` |

### `[PATHFINDER.EXPERIMENTS]`

| `PERSISTENT_DB_CONNECTIONS` | `1` | PDO persistent — saves connect cost, risks stale connections |

### `[PATHFINDER.SYSTEMTAG]`

| `STATUS` | `1` | enable system-tagging plugin |
| `STYLE` | `countConnections` | tag style algorithm |
| `HOME_SYSTEM_ID` | `31000376` | reference system for tagging |

---

## `app/plugin.ini` — UI plugins

```ini
[PLUGIN]
MODULES_ENABLED = 1

[PLUGIN.MODULES]
DOTLAN = ./app/ui/module/dotlan
TAGS   = ./app/ui/module/tags
```

These paths resolve to RequireJS modules under `js/app/ui/module/`. The `./app/ui/module/` prefix is the _client-side_ RequireJS base, not a PHP path.

---

## `app/requirements.ini` — runtime requirements

Surfaced verbatim because `Controller\Setup` checks each one.

### `[REQUIREMENTS.SERVER]`

| `APACHE.VERSION` | `2.4` |
| `NGINX.VERSION` | `1.9` |

### `[REQUIREMENTS.PHP]`

| `VERSION` | `7.2` |
| `PHP_INT_SIZE` | `8` (64-bit) |
| `PCRE_VERSION` | `8.02` |
| `REDIS` | `3.0.0` (extension version, optional) |
| `EVENT` | `2.3.0` (optional) |
| `EXEC` | `1` (enabled) |
| `MAX_EXECUTION_TIME` | `10` |
| `MEMORY_LIMIT` | `256M` |
| `MAX_INPUT_VARS` | `3000` |
| `HTML_ERRORS` | `0` |

### `[REQUIREMENTS.MYSQL]`

| `VERSION` | `5.7` |
| `PDO_TIMEOUT` | `2` |

### `[REQUIREMENTS.MYSQL.VARS]` — applied on each connection

| Var                                                       | Value                                         |
| --------------------------------------------------------- | --------------------------------------------- |
| `DEFAULT_STORAGE_ENGINE`                                  | `InnoDB`                                      |
| `CHARACTER_SET_SERVER/DATABASE/CLIENT/RESULTS/CONNECTION` | `utf8mb4`                                     |
| `COLLATION_DATABASE` / `COLLATION_CONNECTION`             | `utf8mb4_unicode_ci`                          |
| `FOREIGN_KEY_CHECKS`                                      | `ON`                                          |
| `INNODB_FILE_PER_TABLE`                                   | `ON`                                          |
| `WAIT_TIMEOUT`                                            | `28800`                                       |
| `INTERACTIVE_TIMEOUT`                                     | `{{ @REQUIREMENTS.MYSQL.VARS.WAIT_TIMEOUT }}` |

### `[REQUIREMENTS.REDIS]`

| `VERSION` | `3.0` |
| `MAX_MEMORY` | `67108864` (64MB) |
| `MAXMEMORY_POLICY` | `allkeys-lru` |

### `[REQUIREMENTS.PATH]`

| `NODE` | `12.16.0` |
| `NPM` | `6.13.4` |

### `[REQUIREMENTS.CRON]`

| `CLI` | `1` |
| `LOG` | `1` |

### `[REQUIREMENTS.DATA]`

| `NEIGHBOURS` | `5201` | expected row count in a static neighbours table — sanity check during setup |

---

## `app/cron.ini` — scheduled jobs

```ini
[CRON]
log     = TRUE
cli     = TRUE
web     = FALSE     ; cron does NOT run during HTTP requests
silent  = TRUE
```

### Presets (cron expressions)

| Name           | Schedule                                  |
| -------------- | ----------------------------------------- |
| `instant`      | `* * * * *` (every minute)                |
| `fiveMinutes`  | `*/5 * * * *`                             |
| `tenMinutes`   | `*/10 * * * *`                            |
| `halfHour`     | `*/30 * * * *`                            |
| `halfPastHour` | `30 * * * *`                              |
| `downtime`     | `0 11 * * *` (matches `CCP_SSO_DOWNTIME`) |

F3 Cron also recognises `@hourly`, `@weekly` etc., which the job definitions use directly.

### Jobs (all active)

| Job                          | Target                                           | Schedule        |
| ---------------------------- | ------------------------------------------------ | --------------- |
| `deleteEolConnections`       | `Cron\MapUpdate->deleteEolConnections`           | `@fiveMinutes`  |
| `deleteExpiredConnections`   | `Cron\MapUpdate->deleteExpiredConnections`       | `@hourly`       |
| `deleteLogData`              | `Cron\CharacterUpdate->deleteLogData`            | `@instant`      |
| `deleteSignatures`           | `Cron\MapUpdate->deleteSignatures`               | `@halfHour`     |
| `importSystemData`           | `Cron\CcpSystemsUpdate->importSystemData`        | `@halfPastHour` |
| `deactivateMapData`          | `Cron\MapUpdate->deactivateMapData`              | `@hourly`       |
| `cleanUpCharacterData`       | `Cron\CharacterUpdate->cleanUpCharacterData`     | `@hourly`       |
| `deleteMapData`              | `Cron\MapUpdate->deleteMapData`                  | `@downtime`     |
| `deleteAuthenticationData`   | `Cron\CharacterUpdate->deleteAuthenticationData` | `@downtime`     |
| `deleteExpiredCacheData`     | `Cron\Cache->deleteExpiredCacheData`             | `@downtime`     |
| `deleteStatisticsData`       | `Cron\StatisticsUpdate->deleteStatisticsData`    | `@weekly`       |
| `truncateMapHistoryLogFiles` | `Cron\MapHistory->truncateMapHistoryLogFiles`    | `@halfHour`     |
| `updateSovereigntyData`      | `Cron\Universe->updateSovereigntyData`           | `@halfPastHour` |

### Disabled (commented in source — WIP / development only)

```
;updateUniverseSystems = ...\Cron\Universe->updateUniverseSystems, @instant
;setup                 = ...\Cron\Universe->setup, @instant
```

Stage D will document each cron class. Stage I will flag these dead/WIP jobs in the audit.

---

## `app/routes.ini` — URL routes

Page routes (sync, full HTML response):

```
GET  @setup    /setup        Controller\Setup->init
GET  @login    /             Controller\AppController->init
GET  @sso      /sso/@action  Controller\Ccp\Sso->@action
GET  @map      /map*         Controller\MapController->init
GET  @admin    /admin*       Controller\Admin->dispatch
```

AJAX API (note throttle args `0, 512`):

```
GET|POST /api/@controller/@action               Controller\Api\@controller->@action
GET|POST /api/@controller/@action/@arg1         "
GET|POST /api/@controller/@action/@arg1/@arg2   "
POST     /api/Map/updateUnloadData              Controller\Api\Map->updateUnloadData
```

REST API (under `[maps]` section):

```
ANY /api/rest/@controller*           Controller\Api\Rest\@controller
ANY /api/rest/@controller/@id        Controller\Api\Rest\@controller
```

The trailing `0, 512` are F3 route TTL/kbps args (response cache TTL = 0, bandwidth limit = 512). Throttling is bandwidth-shape, **not** request-rate. Auth gating is performed inside each controller.

Wildcard `@controller`/`@action` mean the API surface is implicit — every public method on every class under `Controller\Api\` and `Controller\Api\Rest\` is reachable. Stage C will enumerate the actual set.

---

## Deployment topology

```
                ┌──────────────────────────────────────┐
   Browser  →   │  Apache 2.4 / Nginx 1.9+             │
                │  PHP 7.2 (FPM)                       │
                │    index.php  ─── Fat-Free runtime   │
                │       ├── HTTP routes (Controller/*) │
                │       └── reads tmp/cache, sessions  │
                └────┬─────────────────────────┬───────┘
                     │                         │
                     ▼                         ▼
              ┌─────────────┐          ┌──────────────────┐
              │  MySQL 5.7+  │          │ Realtime socket │
              │  - pathfinder│          │ (react/socket   │
              │  - eve_universe         │  + ndjson)      │
              │  - sessions  │          │ separate proc   │
              └─────────────┘          └──────────────────┘

   CLI cron  →   php index.php (F3 Cron auto-dispatch via cron.ini)
                 ↳ writes logs/, history/, mutates pathfinder DB
```

Operational facts:

- **Web tier:** stateless PHP-FPM processes. Sessions in MySQL — any node can serve any request.
- **Two MySQL schemas required:** `pathfinder` (mutable) and `eve_universe` (static). A third (`DB_CCP_*`) is configurable but typically unused.
- **Cache backend selectable** via `CACHE` in `config.ini` (filesystem default, Redis supported). If Redis: configure `MAX_MEMORY=64M`, `allkeys-lru`.
- **Sessions live in MySQL** regardless of cache backend (`SESSION_CACHE = mysql`).
- **Cron runs from CLI only** (`web = FALSE`). A system crontab entry must invoke the F3 cron dispatcher.
- **Realtime socket is a separate long-running process** (Stage D will document; not started by `index.php`).
- **Mail goes via SMTP** — host/credentials in `environment.ini`. Used for rally notifications and admin error mail.
- **Site-local secrets in `conf/environment.ini`.** The repo's `app/environment.ini` ships with empty production credentials by design.
- **Static EVE data** comes from `export/sql/eve_universe.sql.zip` (one-shot import; updated on EVE expansions). Static cron jobs (`updateSovereigntyData`, `importSystemData`) keep the _mutable_ parts in sync via ESI.

### Filesystem write requirements

| Path                                       | Why                                                          |
| ------------------------------------------ | ------------------------------------------------------------ |
| `tmp/`                                     | F3 template cache + scratch                                  |
| `tmp/cache/`                               | `CACHE` backend (filesystem default)                         |
| `logs/`                                    | Monolog output, one file per `[PATHFINDER.LOGFILES]` channel |
| `history/`                                 | NDJSON map history (created on demand)                       |
| `public/js/`, `public/css/`, `public/img/` | Gulp output — built at deploy, not at runtime                |

### Build pipeline

`gulpfile.js` (Gulp 4, Node 12.x). Outputs are versioned per `package.json` `version` into `public/{js,css,img}/v<version>/`. Tasks:

- `concatJS` — RequireJS optimizer bundles per page (`login`, `mappage`, `setup`, `admin`, plus loaders `pnotify.loader`, `datatables.loader`, `summernote.loader`).
- `diffJS` — standalone JS files minified individually.
- `sass` / `cleanCss` — SCSS → CSS, autoprefixed, minified.
- `gzip*` / `brotli*` — pre-compressed assets (`.gz`, `.br`) emitted next to originals.
- Image tasks: header resizes `[480, 780, 1200, 1600, 3840]px`, gallery WebP conversion, SVG/raster passthrough.
- `default` (dev) — watch mode, sourcemaps, no minification.
- `production` — minify + gzip + brotli + image optimize.

### Logging

- Monolog channels per `[PATHFINDER.LOGFILES]`. Each is a separate `logs/<name>.log`.
- `history/` is **not** Monolog — it's append-only NDJSON written by map-update paths and reaped by `Cron\MapHistory`.
- `DEBUG = 0` in production silences F3 internal tracing. SSO and error channels still write.

### Cache key conventions

- All cache keys are prefixed with `PF` (`Lib\Config::PREFIX_KEY`).
- Multi-segment keys join with `-` (`ARRAY_DELIMITER`).
- TTLs come from `[PATHFINDER.CACHE]`; the socket-availability cache uses a 60s constant.

## Dependencies

- [Lib\\Config](../../app/Lib/Config.php) is the only legitimate way to read configuration from application code. Direct `$f3->get('ENVIRONMENT.…')` calls bypass downtime checks and array-key parsing.
- Bootstrap order is fixed: env → DB pool → API clients → socket precheck → cron registration → route dispatch. Inserting work earlier (especially DB-touching) is fragile.

## Known issues / quirks

- **`SESSION_SHARING` is a binary toggle**, not a domain list. Subdomain sharing is all-or-nothing.
- **`SEND_RALLY_Mail_ENABLED`** is mixed-case (`Mail`) in `pathfinder.ini`. F3's `.ini` parser is case-insensitive for section/key names but consuming code that ucfirst's or string-compares may break if the value is normalized differently.
- **No `conf/environment.ini` template** ships in the repo. New deployers learn the required key set by running `/setup` and watching it complain. Commit `37b96bb1` clarified that secrets _should_ live there, but didn't add a sample.
- **Persistent connections + MySQL `WAIT_TIMEOUT`.** `PERSISTENT_DB_CONNECTIONS=1` plus 8h `WAIT_TIMEOUT` is comfortable, but reverse-proxy or PHP-FPM child longevity longer than that breaks the first request after idle. F3 Cortex does not always reconnect cleanly.
- **`CACHE = folder=tmp/cache/`** at scale creates millions of small files. Redis is recommended in production but is not enforced.
- **`SESSION_CACHE = mysql`** means session writes are an additional round-trip per request. Hot login bursts pressure the `sessions` table.
- **`EXEC=1` requirement** assumes PHP `shell_exec`/`exec` is not disabled in `disable_functions`. Some hosting providers disable these by default; the app will fail the requirements check.
- **Throttle args `0, 512` in routes** are bandwidth shaping, not rate limiting. There is no rate-limit middleware visible at the routing layer.
- **`SOCKET_HOST` / `SOCKET_PORT`** are referenced by `Lib\Config::getSocketUri()` but absent from `environment.ini`. Must be added in `conf/environment.ini` (or as real env vars) before the realtime socket can be reached.
- **No CSRF token** observed in the route layer; any state-changing endpoint relies on the session cookie + Origin/Referer. Stage C should audit per-controller defenses.
- **Two commented cron jobs** (`updateUniverseSystems`, `setup`) — silent WIP. Don't enable without reading their implementations.

## Open questions

- How is `pathfinder_env` (or the equivalent switch for `ENVIRONMENT.SERVER`) set in deployment — is it env var, `.htaccess`, or a `conf/` override? `Lib\Config` reads it from server data but the actual production deploy path isn't documented.
  **A:** A `conf/` override
- Is the `conf/` directory committed (with `.gitignore`'d files inside), or expected to be created at deploy time? Look at the deploy scripts.
  **A:** It is a directory with custom, deployment-specific overrides. Not committed, expected to be created at deploy time.
- The `[CRON] web = FALSE` setting means cron must be a real OS cron. Is there a packaged crontab or systemd timer in `export/` or elsewhere?
- `DB_CCP_*` — dead config? Search results for it should be in Stage E.
- `EVE_SCOUT` v2 endpoint has changed shape historically (v1 → v2). Has the integration been validated against the current schema?
  **A:** Yes, the current schema is compatible with v2 of EVE_SCOUT.
- `gulp-requirejs-optimize` + Node 12 vs. modern Node: does the current build still produce identical output, or has it bit-rotted?
  **A:** The current build still works with modern Node.
