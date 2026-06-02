# 04 — Cron & Background Workers

**Stage D output.** Documents every scheduled job and every long-lived background pathway: the cron scheduler (`app/cron.ini` + `app/Cron/*`), the request-tail activity-log flush, and the realtime push transport (an out-of-process TCP socket server that the PHP backend pushes events to and that the browser SharedWorker subscribes to over WebSocket).

Cross-references: data model in [02-data-model.md](02-data-model.md); deployment / config in [01-config-and-deployment.md](01-config-and-deployment.md); HTTP entry points in [03-backend-api.md](03-backend-api.md); ESI / external API surfaces these jobs touch are detailed in Stage E.

## Purpose & scope

Pathfinder runs three classes of background work:

1. **Scheduled cron** — 13 jobs across 6 classes under `app/Cron/`, dispatched by [F3-Cron](https://github.com/dimsav/f3-cron) (wrapped by [`Lib\Cron`](#scheduler-libcron)) from `cron.ini` definitions. CLI-only on a normal deployment (`CRON.cli=TRUE`, `CRON.web=FALSE`). Two further jobs (`updateUniverseSystems`, `setup`) are commented out as WIP/dev-only.
2. **Per-request "background"** — work that runs after the HTTP response is dispatched: activity-log buffering flushed in `Controller::unload` (`INSERT DELAYED` into `activity_log`), and the TCP-socket fire-and-forget writes used to broadcast map / character events. There is no PHP-side queue worker.
3. **Realtime push transport** — an **external** Node-style PHP socket server (`pathfinder-socket`, repo not in this tree) that the backend connects to over TCP/NDJSON to publish events, and that the browser SharedWorker subscribes to over WebSocket at `/ws/map/update`. Inside this repo the only realtime code is the **client** end (PHP `Lib\Socket\*`) and the browser end (`js/app/map/worker.js`, `js/app/worker/map.js`). The socket-server process itself is operated separately; this doc captures the wire protocol and how the PHP/JS clients use it.

Out of scope here: ESI endpoint shapes (Stage E), the on-disk map history NDJSON format consumed by `Api\Rest\Log` (Stage C covered the read side; format is documented below in [Map history pipeline](#map-history-pipeline)).

## Scheduler (`Lib\Cron`)

`app/cron.ini` is loaded at boot (`index.php` → `Lib\Config`) into the F3 `CRON.*` hive and bound to `Lib\Cron` (a thin subclass of F3-Cron, `app/Lib/Cron.php`).

```ini
[CRON]
log     = TRUE      ; write generic cron.log envelope
cli     = TRUE      ; allow CLI dispatch via index.php /cron/<job>
web     = FALSE     ; disable HTTP /cron/<job> dispatch (must be locked down if enabled)
silent  = TRUE      ; emit STDOUT on completion
```

### Presets

Cron expressions can resolve to one of seven named presets (`[CRON.presets]`):

| Preset | Cron | Used by |
|---|---|---|
| `@instant` | `* * * * *` | `deleteLogData` |
| `@fiveMinutes` | `*/5 * * * *` | `deleteEolConnections` |
| `@tenMinutes` | `*/10 * * * *` | — |
| `@halfHour` | `*/30 * * * *` | `deleteSignatures`, `truncateMapHistoryLogFiles` |
| `@halfPastHour` | `30 * * * *` | `importSystemData`, `updateSovereigntyData` |
| `@downtime` | `0 11 * * *` (11:00 UTC, EVE downtime) | `deleteMapData`, `deleteAuthenticationData`, `deleteExpiredCacheData` |
| `@hourly`, `@weekly` | inherited from F3-Cron | `deleteExpiredConnections`, `deactivateMapData`, `cleanUpCharacterData`; `deleteStatisticsData` |

`Lib\Cron::checkPreset()` reverse-maps a stored expression back to its preset name for the admin/setup UI.

### Dispatch & state tracking

- **Trigger.** In production, the host's `crontab` calls `php index.php /cron` once a minute; F3-Cron walks `[CRON.jobs]` and runs each job whose `isDue()` returns true. `Lib\Cron::isDue()` extends parent by skipping jobs that have been flagged paused via `cron` table (`CronModel.isPaused = 1`).
- **Pause / config.** `cron` table (one row per job, keyed by `name`) stores `expr`, `isPaused`, `lastExecStart/End`, `lastExecMemPeak`, `lastExecState` (JSON: `total`, `count`, `importCount`, `offset`, `loop`, `percent`), and `history`. Rows are auto-registered on first run (`Lib\Cron::registerJob`) and read by `Setup` for the admin cron panel.
- **Per-job envelope.** Every concrete job inherits from `AbstractCron` and brackets its body with `logStart(__FUNCTION__)` / `logEnd(__FUNCTION__, $total, $count, $importCount, $offset, $text)`. `logEnd` writes a structured line to `logs/cron_<job>.log` and persists `lastExecState` back to the `cron` row.
- **Resumability.** `AbstractCron::getParams()` reads `?offset=&length=` from `GET` if present (manual CLI run); if not, it falls back to the last `lastExecState`, advancing `offset` by `lastExecState.count`. This is how `importSystemData` and `updateSovereigntyData` chunk through systems across runs.
- **Execution budget.** `setMaxExecutionTime(50)` is set on every `logStart` (overriding CLI's infinite default); `isExecutionTimeLeft($timeStart, null, 3)` is the standard inner-loop guard so the job has 3s left to write its log.
- **Warning thresholds.** `Lib\Cron::DEFAULT_BUFFER_EXEC_TIME = 20%`, `DEFAULT_BUFFER_MEM_PEAK = 20%` — used by `Setup` to render warnings when the last run exceeded the rolling average by more than the buffer.

## Job inventory

Below: one section per cron class. Each job lists trigger, what it touches (tables / files / external services), how it logs, and failure modes.

### `Cron\MapUpdate` (`app/Cron/MapUpdate.php`)

Four jobs, all map / connection housekeeping.

#### `deactivateMapData` — `@hourly`
- **Purpose.** Soft-disable private maps whose `updated` timestamp is older than `[PATHFINDER.MAP.PRIVATE].LIFETIME` days. Corp/alliance maps have no lifetime cap.
- **SQL.** Single `UPDATE map SET active=0 WHERE active=1 AND typeId=2 AND TIMESTAMPDIFF(DAY, updated, NOW()) > :lifetime`.
- **Reads.** `Config::getMapsDefaultConfig('private.lifetime')` (default `60`).
- **Logging.** `logDisabled` — no `cron_deactivateMapData.log` written.
- **Failure modes.** None handled; if `DB.PF` is unavailable the job silently no-ops.

#### `deleteMapData` — `@downtime`
- **Purpose.** Hard-delete maps that have been `active=0` for more than `DAYS_UNTIL_MAP_DELETION = 30` days.
- **Flow.** Selects candidate `map.id`s, then loads each via `MapModel::getById(id, 3, false)` (ttl=3s, no_caching) and calls `erase()` so model lifecycle hooks (cascades to `system`, `connection`, `*_map` access rows) fire — i.e. this is **not** a raw `DELETE` so cascade integrity comes from Cortex.
- **Logging.** ` , %3s maps deleted` (`LOG_TEXT_MAPS_DELETED`).
- **Quirk.** Constant is hard-coded; not configurable from `pathfinder.ini`.

#### `deleteEolConnections` — `@fiveMinutes`
- **Purpose.** Delete connections marked EOL more than `[PATHFINDER.CACHE].EXPIRE_CONNECTIONS_EOL = 15300` seconds (4h 15m) ago, but only on maps where `map.deleteEolConnections = 1`.
- **SQL.** Selects `connection.id` from join, then `ConnectionModel::erase()` per row (so map history log entries are written; see [Map history pipeline](#map-history-pipeline)).
- **Logging.** disabled (`logDisabled`).

#### `deleteExpiredConnections` — `@hourly`
- **Purpose.** Delete `scope='wh'` connections older than `[PATHFINDER.CACHE].EXPIRE_CONNECTIONS_WH = 172800` (48h, the practical wormhole lifetime cap), on maps where `map.deleteExpiredConnections = 1`.
- **Logging.** disabled.

#### `deleteSignatures` — `@halfHour`
- **Purpose.** Bulk `DELETE` from `system_signature` for signatures on **inactive** systems (`system.active=0`) older than `EXPIRE_SIGNATURES = 259200` (72h).
- **Quirk.** This is a raw `DELETE` (not a per-row `erase()`), so `signature_history` rows are not back-filled with deletion entries.
- **Logging.** disabled.

### `Cron\CharacterUpdate` (`app/Cron/CharacterUpdate.php`)

#### `deleteLogData` — `@instant`
- **Purpose.** Probe up to `CHARACTERS_UPDATE_LOGS_MAX = 10` of the oldest `character_log` rows that haven't been touched in `[PATHFINDER.CACHE].CHARACTER_LOG_INACTIVE = 180` seconds and verify the pilot is still online via ESI (`CharacterModel::isOnline($accessToken)`, which calls `esi-location.read_online.v1`).
- **Outcomes per row:** online → `touch('updated')`; offline → `erase()` (also kills the row from the realtime push set); no valid access token (ESI 401 / refresh failure) → `erase()`; orphan row (no character) → `erase()`.
- **Side effects.** May refresh OAuth tokens via the `Lib\Api` ESI client; on a refresh failure the character is silently de-logged from the realtime view.
- **Logging.** disabled.

> **Aperture rebuild — `location-poll`.** The legacy model coupled tracking to the open tab (`updateUserData` writes a `character_log` row; `deleteLogData` ages it out when the pilot goes offline). The rebuild replaces both with a self-rescheduling `location-poll` graphile-worker job, one per tracked character, with an adaptive cadence (`LOCATION_POLL_ONLINE_MS` / `LOCATION_POLL_OFFLINE_MS`) — it runs server-side regardless of whether any tab is open. Tracking is an **explicit per-map selection** in `ap_map_character_tracking (map_id, character_id)`, not a global flag: the handler's first step is "does this character have any tracking row?" and it stops cleanly (`stopped: 'no-tracking'`) when the last row is removed. There is no `ap_character.tracking_enabled` flag (an early rebuild column, since removed) and therefore no `'tracking-disabled'` stop reason. First open of a map by an account seeds all its active characters, gated once per `(map, account)` by `ap_map_tracking_seed`. See `src/lib/jobs/tasks/locationPoll.ts`, `src/lib/jobs/tracking.ts`, and `docs/plans/per-map-character-tracking.md`.

#### `cleanUpCharacterData` — `@hourly`
- **Purpose.** Find characters where `active=1` and `kicked` timestamp has already elapsed, call `CharacterModel::kick()` + `save()` to flip them inactive.
- **Logging.** generic envelope only.

#### `deleteAuthenticationData` — `@downtime`
- **Purpose.** Remove expired `character_authentication` rows (per-row `erase()`). Backs the "remember me" cookie store; see [03-backend-api.md](03-backend-api.md) §`Api\User`.
- **Logging.** generic envelope only.

### `Cron\Cache` (`app/Cron/Cache.php`)

#### `deleteExpiredCacheData` — `@downtime`
- **Purpose.** Recursively walk `f3::TEMP` and unlink files older than `[PATHFINDER.CACHE].EXPIRE_MAX = 864000` (10 days).
- **Implementation.** `Data\Filesystem\Search::getFilesByMTime($dir, $filterTime, DEFAULT_FILE_LIMIT)`; per-file `isFile() && isWritable() && unlink()`. Tracks counts for deleted / size / not-writable / errors.
- **Logging.** `, size [%10s] byte, not writable [%10s] files, errors [%10s]`.
- **Caveat.** Only matters for filesystem CACHE backends. Redis backend's expiry is native; this job is a no-op cleanup for `tmp/cache/`.

### `Cron\StatisticsUpdate` (`app/Cron/StatisticsUpdate.php`)

#### `deleteStatisticsData` — `@weekly`
- **Purpose.** Delete `activity_log` rows from prior years past the current ISO week-of-year (i.e. retain ~1 year of activity data).
- **SQL.** `DELETE FROM activity_log WHERE CONCAT(year, week) < :yearWeekEnd` with `yearWeekEnd = (currentYear-1) . LPAD(currentWeek, 2, '0')`.
- **Logging.** `, %5s rows deleted`.

### `Cron\MapHistory` (`app/Cron/MapHistory.php`)

#### `truncateMapHistoryLogFiles` — `@halfHour`
- **Purpose.** Cap the size of `[PATHFINDER.HISTORY].LOG` (default `history/map/`) per-map NDJSON log files. Pick up to `LOG_COUNT = 3` largest files above `[PATHFINDER.HISTORY].LOG_SIZE_THRESHOLD = 2 MB` (default constant 1 MB) and truncate to the most recent `LOG_LINES = 1000` entries.
- **Flow.** `Search::getFilesBySize($dir, threshold)` → `SortingIterator` by size desc → `LimitIterator(0, 3)` → for each file: `FileHandler::readFileReverse($path, 0, LOG_LINES)` → write to `tempnam(...)` → `rename()` over original → `chmod 0666` (so the long-lived socket server can keep appending).
- **Logging.** Verbose `LOG_TEXT` with per-class counters.
- **Quirk.** `chmod 0666` is essential — see [Map history pipeline](#map-history-pipeline) below. If the original file is owned by the cron user but appended to by the socket-server user, missing `0666` will silently break further appends.

### `Cron\CcpSystemsUpdate` (`app/Cron/CcpSystemsUpdate.php`)

#### `importSystemData` — `@halfPastHour`
- **Purpose.** Pull `getUniverseJumps` + `getUniverseKills` from CCP ESI and update four rolling-24-column log tables: `system_jumps`, `system_kills_ships`, `system_kills_pods`, `system_kills_factions`. These feed the system info & kill-graph modules.
- **Setup phase.** `prepareSystemLogTables()` reads every K-space / L-space / H-space `system.id` from the `UNIVERSE` DB (`security = '0.0'`, `'L'`, or `'H'` — wormhole systems excluded), then `INSERT IGNORE` a row per system into each log table inside a transaction.
- **Update phase.** For each `(systemId, tableName)`:
  - Read previous `lastUpdatedValue` (column 1–24, rotating)
  - Advance to next column (wrap at 24 → 1)
  - `UPDATE <table> SET updated=NOW(), value<n>=:value, lastUpdatedValue=:n WHERE systemId=:id`
  - Counted as "imported" only after the 4th table is updated.
- **Resumable.** Honours `offset` / `length` from `getParams()`; large run is split across multiple invocations.
- **External deps.** `f3->ccpClient()->send('getUniverseJumps' | 'getUniverseKills')` — see Stage E.
- **Logging.** `→ [%.3Fs prepare table, %.3Fs jump, %.3Fs kill, %.3Fs update all]`.

### `Cron\Universe` (`app/Cron/Universe.php`)

#### `updateSovereigntyData` — `@halfPastHour`
- **Purpose.** Pull `getSovereigntyMap` + `getFactionWarSystems` from ESI; for each system in the sov map that is not a wormhole (`security` doesn't contain `'C'` — defensive against ESI sometimes returning WH IDs), call `SystemModel::updateSovereigntyData()` and `updateFactionWarData()`, then `buildIndex()` if either changed.
- **Resumable.** Same `offset`/`length` mechanism as `importSystemData`. Aborts the loop early when `isExecutionTimeLeft()` returns false (3s buffer for log writes), recording `'Script execution stopped due to "max_execution_time" limit reached'` in `msg`.
- **Logging.** `, %4s changes → [%4s sovChanges, %4s fwChanges], msg: %s`.

#### `updateUniverseSystems` — ✗ disabled in `cron.ini` (`@instant` if enabled)
- WIP. Picks the two systems with the oldest `updated` timestamp and calls `SystemModel::updateModel()`. Trickle-refreshes static system metadata from ESI. Not safe to enable as-is per the comment in `cron.ini`.

#### `setup` — ✗ disabled in `cron.ini` (`@instant` if enabled)
- **Dev-only bootstrap.** Builds the initial `eve_universe` DB from ESI when `export/sql/eve_universe.sql.zip` is not available. Driven by `?type=<system|stargate|station|sovereignty|faction_war_systems|index_system>&offset=&length=`. Streams progress to STDOUT (`echoStart`, `echoLoading`, `echoLoaded`, `echoFinish`) and to `cron_setup.log`. Walks all returned system IDs and per-id calls a type-specific loader (`SystemModel::loadById` + `loadPlanetsData` / `loadStargatesData` / `loadStationsData` / `updateSovereigntyData` / `updateFactionWarData` / `buildIndex`).
- **Operator note.** This is what produced the shipped `eve_universe.sql.zip`. If CCP restructures ESI universe endpoints, this is the script that needs to be repaired before a fresh universe rebuild is possible — see [Known issues](#known-issues--quirks).

## Per-request "background" work

Two things straddle the request boundary:

### Activity-log buffer flush (`LogController`)

- During a request, any code path that fires a `MapLog` (e.g. system added, connection mass changed) calls `LogController::instance()->push($log)`. The controller accumulates one buffer entry per `(characterId, mapId)` pair, incrementing per-action counters (the action name must match a countable column on `activity_log`; `ActivityLogModel::getCountableColumnNames()` is cached for `CACHE_TTL_ACTIVITY_COLUMNS = 300s`).
- F3's `unload` hook (`Controller::unload` → `LogController::logActivities`) flushes the buffer to `activity_log` as one transaction of `INSERT DELAYED ... ON DUPLICATE KEY UPDATE updated=NOW(), <col> = <col> + VALUES(<col>)`, keyed by `(year, week, characterId, mapId)`. The `INSERT DELAYED` is significant: it lets the request return without waiting on the write (MySQL queues it server-side). Note: `INSERT DELAYED` is a no-op on InnoDB in modern MySQL (8.0+), where it degrades to a regular `INSERT` — the per-row cost is just absorbed into request tail latency without warning.
- The `LogController` is a `\Prefab` singleton (per-process), so the buffer is **request-scoped** under PHP-FPM. Nothing cross-request lives in PHP memory.

### Realtime fire-and-forget writes

Whenever a controller / model mutates map state, it does a short `$f3->webSocket()->write('<task>', $payload)` call. See next section. These calls block the request for up to the configured TCP timeout (default 1s) — failure does not abort the response (errors are swallowed into a `RejectedPromise` and returned as `['task' => 'error', 'load' => ...]`).

## Realtime push pipeline

```
PHP request          TCP NDJSON (out)                            WebSocket (in/out)
  │  Lib\Socket\         ───────────────►   ┌──────────────────┐    ───────────────►   SharedWorker
  │  TcpSocket                              │ pathfinder-socket │                       (js/app/worker/map.js)
  │  write(task,load)                       │  (external Node-  │                            │
  │                                         │   style PHP daemon)│                            ├──► browser tab port
  │                                         └──────────────────┘                            ├──► browser tab port
                                                  ▲                                          └──► browser tab port
                                                  │ TCP NDJSON 'logData' from
                                                  │ Monolog SocketHandler (map
                                                  │ history writes)
```

The socket server itself is **not in this repo**. It is operated as a separate long-lived process that:
- Listens on `tcp://SOCKET_HOST:SOCKET_PORT` for NDJSON-framed `{task, load}` messages from PHP.
- Listens on the public WebSocket URL (proxied at `/ws/map/update`) for browser connections.
- Maintains a per-character subscription map (clients send `subscribe` with their access tokens; the server fans `mapUpdate` / `mapAccess` / `characterUpdate` etc. only to the subscribed character ports).
- Also functions as the writer for map history NDJSON files (see [Map history pipeline](#map-history-pipeline)).

### PHP client (`Lib\Socket\*`)

| File | Role |
|---|---|
| `Lib\Socket\SocketInterface.php` | Interface contract: `write(string $task, $load): PromiseInterface`. |
| `Lib\Socket\AbstractSocket.php` | Builds a one-shot connection per `write()`: ReactPHP `EventLoop\Factory::create()` → `Connector->connect($uri)` → NDJson `Encoder->write($payload)` → wait for one decoded `data` frame → resolve. Max decoded line: `JSON_DECODE_MAX_LENGTH = 65536 * 4`. Errors are caught and re-wrapped as `['task' => 'error', 'load' => exception->getMessage()]` — no exceptions escape the call. |
| `Lib\Socket\TcpSocket.php` | Concrete TCP connector. `SOCKET_NAME = 'webSocket'`. |
| `Lib\Socket\NullSocket.php` | Used when `SOCKET_HOST`/`SOCKET_PORT` are missing or class missing: `write()` returns a `RejectedPromise` immediately, silently disabling realtime. |

`Lib\Config::__construct` binds `$f3->webSocket = function($options=['timeout'=>1]) { return AbstractSocket::factory(TcpSocket::class, getSocketUri(), $options); }` — every call to `$f3->webSocket()->write(...)` constructs a fresh `TcpSocket` with the per-call options. There is no PHP-side connection pool.

`Config::validSocketConnect()` is the cheap pre-check: it does an `fsockopen(host, port, timeout=1)` against the URL and caches the boolean for `CACHE_TTL_SOCKET_VALID = 60s` (`CACHE_KEY_SOCKET_VALID`). Used by `MapModel::newLog()` to decide whether to log via the socket or fall back to local file streams.

Wire frame: `{"task":"<name>","load":<json>}` followed by `\n` (NDJSON). Replies use the same envelope and may include a `stats` key (see `healthCheck` below).

### Task vocabulary (server-bound)

Sent by PHP via `$f3->webSocket()->write(task, load)`:

| Task | Sender | Load | Triggered when |
|---|---|---|---|
| `mapUpdate` | `AccessController::broadcastMapData` (called from many `Api\Map` / `Api\Rest\Map` actions) | `{config, data: {systems, connections}}` from `MapModel::getData($noCache)` wrapped by `getFormattedMapData` | After any map-affecting controller action — server pushes the new authoritative map state. |
| `mapAccess` | `Api\Map::saveMap`, `Api\Rest\Map::post`/`patch` | array of character IDs that just gained access | When map access grants change (share with corp/alliance/character). |
| `mapConnectionAccess` | `Api\Map::saveConnection` (line 502) | per-connection access data | When a connection is created/updated and a subset of characters needs updated visibility. |
| `mapDeleted` | `Api\Rest\Map::delete` | `mapId` (int) | After a map is soft-deleted via REST. |
| `characterUpdate` | `CharacterModel::broadcastData` (called from `updateData`, `setLocation` etc.) | character payload | Whenever character status/location changes; lets other tabs of the same character see updates. |
| `characterLogout` | `Controller::logoutCharacter` | array of character IDs | On logout (`Api\User\logout`, session expiry) — tells the socket server to evict subscriptions and broadcast to remaining users. |
| `healthCheck` | `Setup::getSocketInformation` (only) | `microtime(true)` token | `/setup` page ping. The server is expected to echo the token back and attach a `stats` object (`startup`, `tcpSocket{...}`, `webSocket{...}`) which the setup page renders into the "Web-Socket" and "TCP-Socket (intern)" status panels. |
| `logData` | `Lib\Logging\Handler\SocketHandler::handle` | `{meta: streamConf, log: <Monolog record>}` | Every map-history `MapLog` write when `validSocketConnect()` is true — the socket server is responsible for appending the formatted line to the corresponding `history/map/map_<mapId>.log` file. See [Map history pipeline](#map-history-pipeline). |

### Browser side

| File | Role |
|---|---|
| `js/app/map/worker.js` | Loader. Builds the `wss?://<host>/ws/map/update` URL, spawns a `SharedWorker(/public/js/v.../app/worker/map.js)`, exposes `init/send/close`. Posts a `ws:init` message into the shared worker carrying `{uri, characterId}`. |
| `js/app/worker/map.js` | SharedWorker body. Single `WebSocket` per browser-origin, shared across tabs. Maintains per-character port list (`characterPorts[]`) so that broadcasts with `meta.characterIds` are fanned only to the relevant tabs. Forwards `ws:open` / `ws:send` / `ws:closed` / `ws:error` to each subscribing port. |
| `js/app/worker/message.js` | `MsgWorker` envelope class shared by both ends. |
| `js/app/mappage.js:228` | Subscribes by sending `MapWorker.send('subscribe', accessData.data)` after pulling tokens from `GET /api/Map/getAccessData`. Switch in `:234-239` dispatches inbound `mapUpdate` / `mapAccess` / `mapDeleted`. |

Client → server tasks: `subscribe`, `unsubscribe` (sent when the last port for a set of characterIds closes — see `sw:closePort` in worker/map.js).

### Failure & fallback semantics

- If `SOCKET_HOST` / `SOCKET_PORT` are unset, `getSocketUri()` returns `false`, `webSocket()` factory returns a `NullSocket`, and **all** realtime broadcasts become no-ops. The client SharedWorker will fail to connect to `/ws/map/update`; `mappage.js` falls back to AJAX polling at `UPDATE_SERVER_MAP.DELAY = 5000ms` and `UPDATE_SERVER_USER_DATA.DELAY = 5000ms` (see `[PATHFINDER.TIMER.*]` in `pathfinder.ini`).
- If the TCP socket is configured but the server is down, every `write()` blocks for the per-call timeout (default 1s for normal writes, 0.6s for setup ping). This is **per-request synchronous tail latency** — there is no batching or queueing. A dead socket server adds 1s to every map-mutating API call.
- The cached `validSocketConnect()` check only gates the map history log path, not the broadcast path. Broadcasts always attempt the connection.

## Map history pipeline

`MapModel::newLog($action)` (`app/Model/Pathfinder/MapModel.php:1029`) constructs a `Lib\Logging\MapLog` with channel metadata `(mapId, mapName)` and attaches handlers based on per-map config:

1. **History file handler** — when `[PATHFINDER.MAP.*].LOG_HISTORY_ENABLED = 1`:
   - If `Config::validSocketConnect()` is `true`: attach `socket` handler (`Lib\Logging\Handler\SocketHandler`) pointed at the TCP socket URI. `SocketHandler::handle()` wraps each Monolog record as `{task: 'logData', load: {meta: streamConf, log: record}}` and writes to the socket. The socket server then appends to `history/map/map_<mapId>.log`. Sending writes off-process avoids contending with PHP-FPM workers for file locks.
   - Otherwise: attach `stream` handler that writes directly to `history/map/map_<mapId>.log` (marked "slow" in code comments because every PHP-FPM worker may contend on the same file).
2. **Slack handler** — `slackChannelHistory` configured: attach `Lib\Logging\Handler\SlackMapWebhookHandler` (group `slackMap`).
3. **Discord handler** — `discordWebHookURLHistory` configured: attach `Lib\Logging\Handler\DiscordMapWebhookHandler` (group `discordMap`).
4. **Activity log** — always: `MapLog::logActivity($isActivityLogEnabled)` toggles the per-request `LogController::push()` path described above.

Truncation of those NDJSON files is handled by `truncateMapHistoryLogFiles` (above). Read side (the connection-log dialog) goes through `/api/rest/Log` — see [03-backend-api.md](03-backend-api.md).

## Logging

All cron / socket-related log targets (paths configurable via `[PATHFINDER.LOGFILES]`):

| File | Written by |
|---|---|
| `logs/cron_<job>.log` | `AbstractCron::logEnd` for every non-disabled job. Format `LOG_TEXT_BASE = '%4s/%-4s %6s done, %5s total, %8s peak, %9s exec'` + per-job suffix. |
| `logs/cron.log` | F3-Cron envelope (top-level dispatch). |
| `logs/socket_error.log` | `[PATHFINDER.LOGFILES].SOCKET_ERROR = socket_error` — used by `Lib\Logging` and clients when socket writes fail (look-ups via `LogController::getLogger('SOCKET_ERROR')`). |
| `history/map/map_<mapId>.log` | NDJSON, one map-history event per line. Written by socket server when available, otherwise by PHP `stream` handler. |

## Operator surface (`/setup`)

`Setup::init` reads `Cron::getJobsConfig()` and renders the cron table (`public/templates/ui/cron_table_row.html`) showing per-job status, last exec, next exec (via preset), pause toggle, exec history mini-chart, and warning highlights when `lastExecMemPeak > avg*1.2` or `lastExecEnd-lastExecStart > avg*1.2`. Pause/resume calls into `Api\Setup` (see [03-backend-api.md](03-backend-api.md)).

The setup page also renders `getSocketInformation()` — fires a `healthCheck` task with a `microtime(true)` token at 600ms timeout, expects token echo + a `stats` object containing `tcpSocket.startup` (uptime epoch) and `webSocket` connection counts. Used to render the two top-of-page socket status panels (`pf-setup-socket`, `pf-setup-webSocket-stats`).

## Known issues / quirks

- **No queue.** All "background" work is either cron-dispatched or fire-and-forget over TCP. There is no PHP worker pool; long-running ESI calls inside HTTP requests block the request.
- **Socket dead → request latency.** As above — every map mutation does a synchronous TCP write that costs up to 1s when the socket server is down.
- **`INSERT DELAYED` is a no-op on InnoDB.** The activity-log flush degrades to regular `INSERT` on modern MySQL; the throughput assumption baked into the buffer design no longer holds.
- **`updateUniverseSystems` is WIP.** Static universe refresh has no working scheduled path; operators must re-ship `eve_universe.sql.zip` or hand-run `Cron\Universe::setup` to refresh it.
- **`Cron\Universe::setup` writes via `echo` + `die()`.** Type errors mid-loop kill the process; not safe to run unattended. Dev-only.
- **`prepareSystemLogTables` excludes wormhole systems.** Wormhole systems never appear in `system_jumps` / `system_kills_*`, so the system info / killboard modules show no historical data inside C-space. Correct behaviour (ESI doesn't expose those numbers per wormhole), but documented here to avoid mistaking it for a bug.
- **`updateSovereigntyData` defensively filters WH IDs.** Comment: "skip wormhole systems → can not have sov data → even though they are returned from sovereignty/map endpoint?!" — CCP API has historically returned IDs that shouldn't be there. Symptom of the broader CCP-API-shape fragility.
- **`MapHistory` chmod 0666.** Required because the truncate cron and the socket server run as different users in typical deployments. Forgetting the chmod silently breaks ongoing log writes on the next truncate.
- **`Cron\MapUpdate::deleteSignatures` is a raw `DELETE`.** Bypasses model lifecycle, so no `signature_history` entries for cron-driven deletions. Sets a quiet floor on what the signature-history feature can actually show.
- **Cron job timeouts hard-coded.** `DEFAULT_MAX_EXECUTION_TIME = 50s` is global and not overridable per job. `importSystemData` and `updateSovereigntyData` rely on this to stay under crontab's 1-minute / 30-minute cadence.
- **No retry / backoff.** Jobs that fail to talk to ESI just log and move on; resumability via `lastExecState.offset` doesn't distinguish "skipped due to error" from "successfully processed".
- **`Lib\Cron::execute` only forwards to parent.** No custom async dispatch. F3-Cron's `async=true` shells out to PHP per job; on Windows this is significantly slower (and the `cli` flag in `cron.ini` is essentially mandatory on Unix).
- **Two TCP-side classes share `SOCKET_NAME = 'webSocket'`.** `TcpSocket` and `NullSocket` both declare this constant — the `webSocket` key on the F3 hive is shared by both, which is intentional but confusing if grepping by class name.

## Open questions

1. **Socket server implementation.** This repo only contains the client (`Lib\Socket`) and browser SharedWorker. Where is the server (`pathfinder-socket`)? Repo URL, deploy story, version pin? Without it, `mapUpdate` broadcasts and `/ws/map/update` both no-op.
**A:** The websocket implementation is part of another repo `https://github.com/KitchenSinkhole/pathfinder_websocket`. It is optionally included during deployment.
2. **`stats` payload shape from `healthCheck`.** Setup expects `payload.stats.tcpSocket.startup`, `payload.stats.webSocket` (subscription stats). Concrete schema needs to come from the server repo for the rebuild.
3. **`subscribe` payload shape.** `mappage.js:228` passes `accessData.data` from `/api/Map/getAccessData` straight to the socket. Need to document what the server expects (token list? token-per-map?).
4. **Per-character broadcast routing.** `meta.characterIds` controls fan-out in the SharedWorker. Where does the server attach those `characterIds`? Presumably by intersecting `mapUpdate.config.access` against its subscriber table — confirm in server repo.
5. **`updateSovereigntyData` chunking interaction with `cron` row.** When the loop breaks on `isExecutionTimeLeft`, `count` is recorded — but `getParams` next run adds `count` to `offset`, which is correct only because there's no other producer. Worth a regression test if a second concurrent run is ever possible.
6. **`Cron\MapUpdate::deleteMapData` and history files.** Hard-delete erases the `map` row; nothing in this job touches `history/map/map_<id>.log`. Are those files purged elsewhere, or do they accumulate forever for deleted maps? Couldn't find a cleanup path.
7. **Activity log retention vs. weekly job.** `deleteStatisticsData` retains ≈52 weeks; UI claims "1 year". The `< CONCAT(year-1, week)` comparison rolls over the year boundary in a way that briefly retains 53 weeks in ISO week 53 years — minor, but worth a note.
8. **`importSystemData` 24-column rotation.** Why 24 (hours? ESI returns hourly buckets)? Confirm against ESI doc and add to data-model note for `system_jumps` et al.
**A:** For these routes, ESI returns hourly buckets.

## Self-check (Stage D)

- [x] All 13 active jobs in `cron.ini` documented; 2 disabled jobs (`updateUniverseSystems`, `setup`) called out.
- [x] All 6 cron classes (`AbstractCron`, `Cache`, `CcpSystemsUpdate`, `CharacterUpdate`, `MapHistory`, `MapUpdate`, `StatisticsUpdate`, `Universe`) read end-to-end.
- [x] Scheduler wrapper (`Lib\Cron`) and per-job state model (`CronModel`, `lastExecState`) covered.
- [x] All four `Lib\Socket\*` files documented; PHP-side task vocabulary enumerated by grepping every `$f3->webSocket()->write(` call site.
- [x] Browser-side realtime transport (`js/app/map/worker.js`, `js/app/worker/map.js`) documented (server-side socket-server process noted as out-of-tree, open question 1).
- [x] Map-history pipeline (Monolog `SocketHandler` → socket server → `history/map/*.log` → `truncateMapHistoryLogFiles`) traced.
- [x] Per-request activity-log flush in `Controller::unload` documented.
- [x] Open questions captured (8) rather than silently dropped.
- [x] Feature matrix updated (see Stage D section in [10-feature-matrix.md](10-feature-matrix.md)).
