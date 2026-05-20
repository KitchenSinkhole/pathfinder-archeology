# 02 — Data Model

**Stage B output.** Sibling docs: [00-overview.md](00-overview.md), [01-config-and-deployment.md](01-config-and-deployment.md), [10-feature-matrix.md](10-feature-matrix.md). Forward references to Stage C (`03-backend-api.md`), Stage D (`04-cron-and-background.md`), and Stage E (`05-external-integrations.md`) are noted where the model is consumed elsewhere.

## Purpose

Document the complete persistence layer of Pathfinder: the two MySQL schemas, every Cortex ORM model class (38 in `Pathfinder/`, 22 in `Universe/`, 2 abstract bases), the activity-log / change-tracking mechanics, the rolling-window stats tables, the lookup/static data, the `app/Db/` schema-helper layer, and the SQL/CSV bootstrap files. This is the canonical schema reference for the rebuild.

## Surface area

The application reads/writes two logical MySQL databases (DSN aliases in `environment.ini` — see [01-config-and-deployment.md](01-config-and-deployment.md)):

| DSN alias  | Schema         | Role                                                                                                                                                                                               |
| ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PF`       | `pathfinder`   | Mutable app state: maps, systems, connections, signatures, users, characters, audit logs, sessions, cron tracking. **All request-path writes go here.**                                            |
| `UNIVERSE` | `eve_universe` | Static CCP data: systems, stargates, regions, types, dogma attributes, sovereignty. **Refreshed only from `Cron\Universe` / `Cron\CcpSystemsUpdate`** (Stage D). Never written from request paths. |
| `CCP`      | (optional)     | DSN block exists in `environment.ini` but no live code path uses it as of v2.2.3. Treat as dead config.                                                                                            |

```
┌─────────────────────────────────────────────┐    ┌──────────────────────────────────────┐
│   pathfinder DB (PF)                        │    │   eve_universe DB (UNIVERSE)         │
│   - map, system, connection, signature      │    │   - system, constellation, region    │
│   - character, user, user_character         │    │   - stargate, station, structure     │
│   - {character|corp|alliance}_map (joins)   │    │   - star, planet                     │
│   - character_authentication                │    │   - type, group, category            │
│   - character_log, connection_log,          │    │   - dogma_attribute, type_attribute  │
│     activity_log                            │    │   - faction, faction_war_system,     │
│   - system_jumps, system_kills_{ships|      │    │     race                             │
│     pods|factions}                          │◀──▶│   - alliance, corporation            │
│   - role, right, corporation_right,         │    │   - sovereignty_map                  │
│     corporation_structure, structure,       │    │   - system_neighbour (routing graph) │
│     structure_status                        │    │   - system_static (WH spawns)        │
│   - map_type, map_scope, system_type,       │    │                                      │
│     system_status, connection_scope,        │    │   Bootstrap: export/sql/             │
│     character_status                        │    │     eve_universe.sql.zip (DDL only)  │
│   - cron, sessions                          │    │   Populated by Cron\Universe via ESI │
└─────────────────────────────────────────────┘    └──────────────────────────────────────┘
        ▲                                                       ▲
        │ writes from controllers + cron                        │ reads from controllers
        │                                                       │ writes only from cron
```

The schemas are linked by **`systemId` FKs that cross databases** — `pathfinder.system.systemId` references `eve_universe.system.id` but no DB-level FOREIGN KEY exists (different schemas). Joins are done in PHP via `loadById` lookups and the search index cache, not SQL.

A third schema-like surface, the **`sessions` table inside the `PF` DB**, is created on first request by [Db\\Sql\\Mysql\\Session](../../app/Db/Sql/Mysql/Session.php) (see §20).

## Cortex ORM primer

All models extend `\DB\Cortex` (the F3 Cortex ORM). Schemas are declared in PHP via a `$fieldConf` array per class; tables are created via the `setup()` flow (one-time, from `/setup` — see [03-backend-api.md] forward).

```php
protected $fieldConf = [
    'fieldName' => [
        'type'           => Schema::DT_INT,       // INT, VARCHAR128/256/512, TEXT, BOOL, FLOAT, DOUBLE, BIGINT, JSON, TIMESTAMP, DATETIME
        'nullable'       => false,
        'default'        => 0,                    // or Schema::DF_CURRENT_TIMESTAMP
        'index'          => true,
        'unique'         => true,                 // single-column unique
        'belongs-to-one' => 'Full\Class\Path',    // FK relation
        'has-many'       => ['Full\Class\Path', 'foreignKeyField'],
        'has-one'        => [...],
        'constraint'     => [['table' => 't', 'on-delete' => 'CASCADE']],
        'validate'       => 'notDry',             // calls validate_notDry() — see §4
        'activity-log'   => true,                 // tracked by AbstractMapTrackingModel — see §6
        'counter'        => true,                 // ActivityLogModel only — see §10
    ],
];
```

Key conventions used everywhere:

- **`active` BOOL flag** is the soft-delete convention. `setActive(bool)` is the only legal mutator (`set_active` blocks `$this->active = ...` unless `$allowActiveChange` was flipped first — anti-foot-gun guard, [AbstractModel.php:267](../../app/Model/AbstractModel.php:267)).
- **`created` / `updated` TIMESTAMP** are auto-injected by `AbstractModel::getStaticFieldConf` when `$addStaticFields = true` (the default; lookup tables override to `false`). `$f3->touch('updated')` fires on any field write ([AbstractModel.php:225-258](../../app/Model/AbstractModel.php:225)).
- **Schema cache** is held by F3 for `$ttl` seconds (default 60s on subclasses, 86400s default constant). `clearSchemaCache()` is exposed but rarely called.
- **`$rel_ttl = 0`** — relational data is **not** cached by Cortex; expensive joins are not memoized at the ORM layer.
- **`DEFAULT_CACHE_TTL = 120`** — the convention for `getData()` result caching. Each model that overrides `getData()` is expected to use `getCacheData()` / `updateCacheData()` against its primary-key cache key (`DATACACHE.<TABLE>.ID_<id>` or `DATACACHE.<TABLE>.<PREFIX>_<id>`).
- **`CACHE_MAX_DAYS = 60`** — the freshness threshold used by `isOutdated()` for static-data models (see §8).
- **CSV import/export** is built into `AbstractModel` (`$enableDataImport` / `$enableDataExport`). `loadCSV()` reads from `export/csv/<table>.csv` with `;` delimiter; `importStaticData()` does upsert + delete-missing.
- **Cross-DB FKs do not exist.** `belongs-to-one` between PF and UNIVERSE schemas is impossible at the DDL level — wherever a `systemId` column references the static universe DB, it's a plain INT with no `constraint` block.

## Section index

1. [AbstractModel](#4-abstractmodel) — base behavior (event hooks, cache, validation, CSV).
2. [AbstractPathfinderModel](#5-abstractpathfindermodel) — PF alias + activity-log capture.
3. [AbstractMapTrackingModel](#6-abstractmaptrackingmodel) — the change-tracking system.
4. [AbstractSystemApiBasicModel](#7-abstractsystemapibasicmodel) — rolling 24-slot stats.
5. [AbstractUniverseModel](#8-abstractuniversemodel) — static-data layer.
6. [Pathfinder — core entities](#9-pathfinder-models--core-entities).
7. [Pathfinder — audit & activity](#10-pathfinder-models--audit--activity).
8. [Pathfinder — access & org](#11-pathfinder-models--access--org).
9. [Pathfinder — join tables](#12-pathfinder-models--join-tables).
10. [Pathfinder — lookup/static](#13-pathfinder-models--lookupstatic).
11. [Pathfinder — stats](#14-pathfinder-models--stats).
12. [Pathfinder — infrastructure](#15-pathfinder-models--infrastructure).
13. [Universe — spatial hierarchy](#16-universe-models--spatial-hierarchy).
14. [Universe — items & dogma](#17-universe-models--items--dogma).
15. [Universe — factions & ownership](#18-universe-models--factions--ownership).
16. [Universe — routing](#19-universe-models--routing).
17. [`app/Db/` schema helpers](#20-appdb-schema-helpers).
18. [Bootstrap data files](#21-bootstrap-data-files).
19. [Known issues / quirks](#22-known-issues--quirks).
20. [Open questions](#23-open-questions).

---

## 4. `AbstractModel`

File: [app/Model/AbstractModel.php](../../app/Model/AbstractModel.php). Direct parent of `AbstractPathfinderModel` and `AbstractUniverseModel`. Extends `\DB\Cortex`.

**Constants.**

| Constant                | Value     | Use                                                           |
| ----------------------- | --------- | ------------------------------------------------------------- |
| `DB_ALIAS`              | `''`      | Overridden by `PF` / `UNIVERSE`.                              |
| `DEFAULT_CHARSET`       | `utf8mb4` | Passed into `setup()` for table creation.                     |
| `DEFAULT_TTL`           | `86400`   | Default schema cache TTL.                                     |
| `DEFAULT_CACHE_TTL`     | `120`     | Convention for `getData()` cache.                             |
| `DEFAULT_CACHE_CSV_TTL` | `120`     | CSV-import staging cache.                                     |
| `DEFAULT_SQL_TTL`       | `3`       | Default SQL result cache for `getById`.                       |
| `CACHE_KEY_PREFIX`      | `INDEX`   | Search-index prefix (UNIVERSE overrides to `INDEX_UNIVERSE`). |
| `CACHE_KEY_CSV_PREFIX`  | `CSV`     | CSV import cache.                                             |
| `CACHE_MAX_DAYS`        | `60`      | Static-data freshness threshold.                              |

**Auto-injected fields** (when `$addStaticFields = true`, the default):

| Field     | Type         | Default                        | Index |
| --------- | ------------ | ------------------------------ | ----- |
| `created` | DT_TIMESTAMP | `Schema::DF_CURRENT_TIMESTAMP` | yes   |
| `updated` | DT_TIMESTAMP | `Schema::DF_CURRENT_TIMESTAMP` | yes   |

**Event hooks** (overridable in subclasses):

- `beforeInsertEvent($self, $pkeys) : bool` — default touches `updated`; return `false` aborts the insert.
- `afterInsertEvent($self, $pkeys)`
- `beforeUpdateEvent` / `afterUpdateEvent`
- `beforeEraseEvent` / `afterEraseEvent`

**`set($key, $val)` override** ([:225](../../app/Model/AbstractModel.php:225)): trims strings, touches `updated` if the value (or related model's PK) changed, runs `validateField()`. Validation failures throw `ValidationException` which `save()` catches and accumulates into `getErrors()`.

**Validators.**

- `validate_notDry($key, $val)` — for `belongs-to-one` fields. Accepts a positive int (PK) or a loaded model instance; rejects unsaved instances.
- `validate_notEmpty($key, $val)` — for scalar fields. Numeric > 0, or non-empty string.

**Cache helpers.**

- `getCacheKey($prefix)` → `DATACACHE.<TABLE>.[<PREFIX>_|ID_]<id>` (only set when `_id > 0`).
- `getCacheData($prefix)` — return cached `getData()` blob, or `null`.
- `updateCacheData($data, $prefix, $ttl)`.
- `clearCacheData()` / `clearCacheDataWithPrefix($prefix)`.
- `setCacheValue($key, $data, $ttl)` / `existsCacheValue($key, &$val)` — write/read direct to `\Cache::instance()` **without** populating the F3 hive (avoids the hive bloating for thousands of static-data rows).

**Query helpers.**

- `getById(int $id, int $ttl = 3, bool $isActive = true) : bool` — primary loader; appends `active = true` filter when the model has the column.
- `getByForeignKey(string $key, $value, array $options = [], int $ttl = 0, bool $isActive = true) : bool`.
- `relFindOne($key, $filter)` / `relFind($key, $filter)` — relation traversal helpers (used by access checks).
- `getFilter(string $key, $value, $operator = '=', $suffix = '') : array` — placeholder-bound filter array for Cortex.

**Soft-delete protection.** `set_active($active)` rejects direct `$this->active = false` writes unless `setActive(bool)` was called first ([:267](../../app/Model/AbstractModel.php:267)). This is an explicit defense against accidental mass-deactivation through fluent assignment.

**Data freshness.** `isOutdated()` compares `updated` against `CACHE_MAX_DAYS` (60) days. Used by `AbstractUniverseModel::loadById` to trigger ESI refresh.

**Schema helpers.**

- `getTableModifier()` → an [`app/Db/Sql/Mysql/TableModifier`](#20-appdb-schema-helpers) instance.
- `indexExists(array $columns)` — checks for compound indexes by `<table>___<col>__<col>` naming.
- `setMultiColumnIndex(array $columns, bool $unique = false, int $length = 20)` — idempotent compound index creation.
- `setup($db, $table, $fields)` — overrides parent to additionally seed `static::$tableData` (lookup-table static rows) via `importStaticData`.

**CSV.**

- `loadCSV(string $fileName) : array` — reads `export/csv/<name>.csv` with `;` delimiter.
- `getCSVData(string $table, string $getByKey = 'id')` — cached version keyed by `INDEX_CSV_<table>`.
- `importData()` — public method; loads `<table>.csv` and runs `importStaticData()` (upsert by `id`, delete rows missing from CSV — destructive).
- `exportData(array $fields = [])` — streams a CSV download (used by admin tooling).

**Logging.** `newLog(string $action)` returns a `Logging\DefaultLog`; overridden in `AbstractMapTrackingModel` subclasses to point at the appropriate log channel.

---

## 5. `AbstractPathfinderModel`

File: [app/Model/Pathfinder/AbstractPathfinderModel.php](../../app/Model/Pathfinder/AbstractPathfinderModel.php). Direct parent of every model in `Pathfinder/`. Sets `DB_ALIAS = 'PF'`.

**Adds:**

- `protected $enableActivityLogging = true` — togglable via `setActivityLogging(bool)`. When `false`, `getFieldChanges()` returns empty.
- `protected $fieldChanges = []` — populated by `save()` from `getFieldChanges()` _before_ delegating to `parent::save()`, because Cortex resets the schema's `initial`/`value` pair on save and the diff would otherwise be lost.
- `reset(bool $mapper, bool $essentials)` — clears `$fieldChanges` in addition to parent reset.
- `hasAccess(CharacterModel $characterModel) : bool` — base implementation returns `true`. Overridden by `MapModel`, `SystemModel`, `ConnectionModel`, etc. for access control (Stage C will enumerate per-route).

**`getFieldChanges()` mechanics.** Iterates `$fieldConf` for entries with `'activity-log' => true`. For each, if `$this->changed($key)`, captures `['old' => $schema[$key]['initial'], 'new' => $schema[$key]['value']]`. Returns the diff array. This is the substrate for the activity log — see §6.

---

## 6. `AbstractMapTrackingModel`

File: [app/Model/Pathfinder/AbstractMapTrackingModel.php](../../app/Model/Pathfinder/AbstractMapTrackingModel.php). Parent of `MapModel`, `SystemModel`, `ConnectionModel`, `SystemSignatureModel`. Implements `LogModelInterface`.

This is the most important abstract in the codebase. It implements **who-changed-what-when** auditing across the editable map graph.

**Auto-injected fields** (merged via `getStaticFieldConf()` on top of the base `created`/`updated`):

| Field                | Type            | FK target        | On delete | Validation |
| -------------------- | --------------- | ---------------- | --------- | ---------- |
| `createdCharacterId` | DT_INT, indexed | `CharacterModel` | CASCADE   | `notDry`   |
| `updatedCharacterId` | DT_INT, indexed | `CharacterModel` | CASCADE   | `notDry`   |

> **Caveat:** because the constraint is CASCADE on character delete, erasing a character will cascade-delete every map / system / connection / signature they ever created. In practice characters are never erased — they are flagged `kicked` or `banned` (see `CharacterModel`). Worth flagging for the rebuild.

**`save(CharacterModel $characterModel = null)`** — overrides the parent signature. On first save (`dry()`) sets both `createdCharacterId` and `updatedCharacterId`; on subsequent saves sets only `updatedCharacterId`. Then delegates up to `AbstractPathfinderModel::save()` which captures `$fieldChanges` before delegating to `AbstractModel::save()`.

**`logActivity(string $action)`** — called from `afterInsertEvent` / `afterUpdateEvent` / `afterEraseEvent` of concrete subclasses. When `$enableActivityLogging` is on, calls `$this->newLog($action)->setCharacter($this->updatedCharacterId)->setData($this->fieldChanges)->buffer()`. The "buffer" is flushed by a request-end handler (Stage D will document the flush path).

**`LogModelInterface`** (defined in [LogModelInterface.php](../../app/Model/Pathfinder/LogModelInterface.php)) requires:

- `getLogObjectData() : array` — short identity blob for the log entry.
- `getMap() : MapModel` — every tracked entity must resolve back to a map (so the activity log can scope per-map).
- `getLogData() : array` — extended payload; default is `[]` (subclasses override).

**Worked example: a system gets renamed via the map UI.**

1. `MapController` loads a `SystemModel` and calls `$system->setData(['alias' => 'New Name'])`.
2. `setData` does `$system->alias = 'New Name'`. `AbstractModel::set` runs, sees the change, calls `touch('updated')`.
3. `$system->save($character)` enters `AbstractMapTrackingModel::save`. `updatedCharacterId` is set to the character's PK.
4. Cascades to `AbstractPathfinderModel::save`, which calls `getFieldChanges()`. Because `alias` has `activity-log => true`, the diff array becomes `['alias' => ['old' => 'X', 'new' => 'New Name']]`.
5. Cascades to `AbstractModel::save` → Cortex emits `UPDATE`.
6. `afterUpdateEvent` (in `SystemModel`) calls `logActivity('system_update')`. A buffered log entry is queued; an `ActivityLogModel` counter for `(characterId, mapId).systemUpdate` is incremented in the post-request flush.

This is why every tracked field carries the `'activity-log' => true` annotation — see the per-model field tables below.

---

## 7. `AbstractSystemApiBasicModel`

File: [app/Model/Pathfinder/AbstractSystemApiBasicModel.php](../../app/Model/Pathfinder/AbstractSystemApiBasicModel.php). Parent of `SystemJumpModel`, `SystemShipKillModel`, `SystemPodKillModel`, `SystemFactionKillModel`.

**Purpose.** Holds 24 hours of hourly counters per system as a circular buffer of 24 columns, refreshed from ESI by `Cron\System` (Stage D).

**Constants.**

- `DATA_COLUMN_COUNT = 24`
- `DATA_COLUMN_PREFIX = 'value'`

**Auto-injected fields:**

| Field                | Type   | Default | Index | Notes                                          |
| -------------------- | ------ | ------- | ----- | ---------------------------------------------- |
| `lastUpdatedValue`   | DT_INT | 1       | yes   | Which `valueN` column was written last (1–24). |
| `value1` … `value24` | DT_INT | 0       | —     | Rolling hourly counter slots.                  |

**`getValues()`** ([:56](../../app/Model/Pathfinder/AbstractSystemApiBasicModel.php:56)) reorders the 24 slots so the returned array is `[oldest, …, newest]`. The cron writer advances `lastUpdatedValue` modulo 24 each tick and overwrites that slot. `getData()` emits `{systemId, values[24], updated}`.

> **Granularity note.** Only 24 hours are retained; older counters are overwritten. Long-term system-activity analysis is impossible from this table. The rebuild should consider a time-series table if longer history is desired.

---

## 8. `AbstractUniverseModel`

File: [app/Model/Universe/AbstractUniverseModel.php](../../app/Model/Universe/AbstractUniverseModel.php). Direct parent of every model in `Universe/`. Sets `DB_ALIAS = 'UNIVERSE'`.

**Constants.**

- `CACHE_KEY_PREFIX = 'INDEX_UNIVERSE'` (overrides parent).
- `CACHE_INDEX_EXPIRE_KEY = 86400 * 356 * 5` — ≈ 4.87 years (note: `356` not `365` — a typo that's been there a long time; effectively "never expires until manual clear"). This is the TTL for the per-row search-index cache.

**Loading flow.**

1. `loadById(int $id, string $accessToken = '', array $additionalOptions = [])` — call `getById`. If the row is missing or `isOutdated()` (older than `CACHE_MAX_DAYS = 60`), call `loadData()` (subclass-specific ESI fetch) and save.
2. `loadData()` — abstract; each subclass hits a specific ESI endpoint via `$f3->ccpClient()`.
3. `buildIndex()` — after-update hook in `SystemModel`. Writes `getData()` to the search-index cache (`INDEX_UNIVERSE_<table>_<md5(id)>`) and appends the hash key to the table index (`INDEX_UNIVERSE_<table>`). The map autocomplete and system search both read from this cache rather than scanning rows.
4. `fromIndex(int $id)` — read from cache; rebuild if missing.

**`set_position($position)`** — convenience setter that splits a `{x, y, z}` array onto the three columns.

**`beforeUpdateEvent`** — touches `updated` unconditionally so the freshness window resets even when only relations changed.

**`getSystemSecurityFromId(int $id)`** — translates a CCP `securityClass` integer into Pathfinder's label set (`C1`–`C6`, `H`, `L`, `0.0`, `P` for Pochven, `A` for Abyssal). Used by `SystemModel::set_securityStatus`.

---

## 9. Pathfinder models — core entities

### 9.1 `MapModel` — `map`

File: [app/Model/Pathfinder/MapModel.php](../../app/Model/Pathfinder/MapModel.php). Extends `AbstractMapTrackingModel`.

The root entity. Owns systems, connections, characters/corps/alliances with access.

| Field                                      | Type        | Default | Activity-log | Relation / constraint                                        | Notes                                  |
| ------------------------------------------ | ----------- | ------- | ------------ | ------------------------------------------------------------ | -------------------------------------- |
| `active`                                   | DT_BOOL     | 1       |              |                                                              |                                        |
| `scopeId`                                  | DT_INT      |         | ✓            | belongs-to MapScopeModel, ON DELETE CASCADE, validate notDry | wh / k-space / none / all              |
| `typeId`                                   | DT_INT      |         | ✓            | belongs-to MapTypeModel, ON DELETE CASCADE, validate notDry  | private / corp / alliance              |
| `name`                                     | VARCHAR128  | `''`    | ✓            | validate                                                     |                                        |
| `icon`                                     | VARCHAR128  | `''`    | ✓            |                                                              | Glyphicon class                        |
| `deleteExpiredConnections`                 | DT_BOOL     | 1       | ✓            |                                                              | 24h cron sweep                         |
| `deleteEolConnections`                     | DT_BOOL     | 1       | ✓            |                                                              | post-EOL sweep                         |
| `persistentAliases`                        | DT_BOOL     | 1       | ✓            |                                                              | keep custom system names through purge |
| `persistentSignatures`                     | DT_BOOL     | 1       | ✓            |                                                              |                                        |
| `trackAbyssalJumps`                        | DT_BOOL     | 1       | ✓            |                                                              |                                        |
| `logActivity`                              | DT_BOOL     | 1       | ✓            |                                                              | per-map toggle for ActivityLog         |
| `logHistory`                               | DT_BOOL     | 0       | ✓            |                                                              | per-map toggle for NDJSON history file |
| `nextBookmarks`                            | VARCHAR256  | `'[]'`  | ✓            |                                                              | JSON array of bookmark ids             |
| `slackWebHookURL`                          | VARCHAR128  | `''`    |              | validate                                                     | webhook for map events                 |
| `slackUsername`                            | VARCHAR128  | `''`    | ✓            |                                                              |                                        |
| `slackIcon`                                | VARCHAR128  | `''`    | ✓            |                                                              |                                        |
| `slackChannelHistory`                      | VARCHAR128  | `''`    | ✓            |                                                              | channel override                       |
| `slackChannelRally`                        | VARCHAR128  | `''`    | ✓            |                                                              | channel for rally pokes                |
| `discordUsername`                          | VARCHAR128  | `''`    | ✓            |                                                              |                                        |
| `discordWebHookURLRally`                   | VARCHAR256  | `''`    |              | validate                                                     |                                        |
| `discordWebHookURLHistory`                 | VARCHAR256  | `''`    |              | validate                                                     |                                        |
| `systems`                                  | has-many    |         |              | SystemModel[mapId]                                           |                                        |
| `connections`                              | has-many    |         |              | ConnectionModel[mapId]                                       |                                        |
| `mapCharacters`                            | has-many    |         |              | CharacterMapModel[mapId]                                     |                                        |
| `mapCorporations`                          | has-many    |         |              | CorporationMapModel[mapId]                                   |                                        |
| `mapAlliances`                             | has-many    |         |              | AllianceMapModel[mapId]                                      |                                        |
| `createdCharacterId`, `updatedCharacterId` | (inherited) |         |              | (see §6)                                                     |                                        |
| `created`, `updated`                       | TIMESTAMP   |         |              |                                                              |                                        |

**Cache keys.**

- `DATACACHE.MAP.ID_<id>` — `getData()` output.
- `DATACACHE.MAP.CHARACTERS_<id>` — characters currently online on this map (`DATA_CACHE_KEY_CHARACTER = 'CHARACTERS'`).

**Selected methods.**

- `setData(array)` — bulk field assignment from controller payloads; skips id/created/updated.
- `getData(bool $isCcp = false, bool $isLogActivityHistory = false, bool $isLogHistory = false)` — heavyweight: includes nested types/scopes, character/corp/alliance access blocks, last-edited info. Cached.
- Access helpers used by `MapController` for the access matrix (Stage C will trace).

### 9.2 `SystemModel` — `system`

File: [app/Model/Pathfinder/SystemModel.php](../../app/Model/Pathfinder/SystemModel.php). Extends `AbstractMapTrackingModel`.

A node on a map. `systemId` references the static `eve_universe.system.id` (cross-DB; no FK).

| Field               | Type         | Default | Activity-log | Relation / constraint                                     | Notes                                    |
| ------------------- | ------------ | ------- | ------------ | --------------------------------------------------------- | ---------------------------------------- |
| `active`            | DT_BOOL      | 1       |              |                                                           |                                          |
| `mapId`             | DT_INT       |         |              | belongs-to MapModel, ON DELETE CASCADE                    |                                          |
| `systemId`          | DT_INT       |         |              | validate                                                  | cross-DB ref to `eve_universe.system.id` |
| `alias`             | VARCHAR128   | `''`    | ✓            |                                                           | user-set system label                    |
| `tag`               | VARCHAR128   | `''`    |              |                                                           | short label (e.g. chain position)        |
| `typeId`            | DT_INT       |         |              | belongs-to SystemTypeModel, ON DELETE CASCADE             | w-space / k-space / a-space              |
| `statusId`          | DT_INT       | 1       | ✓            | belongs-to SystemStatusModel, ON DELETE CASCADE, validate | unknown/friendly/hostile/etc.            |
| `locked`            | DT_BOOL      | 0       | ✓            |                                                           | prevent accidental delete                |
| `rallyUpdated`      | DT_TIMESTAMP | null    |              |                                                           | when rally was set                       |
| `rallyPoke`         | DT_BOOL      | 0       | ✓            |                                                           | trigger broadcast on save                |
| `description`       | DT_TEXT      |         | ✓            | validate                                                  | rich-text intel notes                    |
| `posX`              | DT_INT       | 0       |              |                                                           | 0..MAX_POS_X (2440)                      |
| `posY`              | DT_INT       | 0       |              |                                                           | 0..MAX_POS_Y (1480)                      |
| `signatures`        | has-many     |         |              | SystemSignatureModel[systemId]                            |                                          |
| `connectionsSource` | has-many     |         |              | ConnectionModel[source]                                   |                                          |
| `connectionsTarget` | has-many     |         |              | ConnectionModel[target]                                   |                                          |

**Constants.** `MAX_POS_X = 2440`, `MAX_POS_Y = 1480` (clamped by the renderer; see Stage G). `MAX_SIGNATURES_HISTORY_DATA = 10`, `TTL_SIGNATURES_HISTORY = 7200` (2h), `DATA_CACHE_KEY_SIGNATURES_HISTORY = 'HISTORY_SIGNATURES'`.

**Signature history.** Each signature mutation pushes a snapshot into a cache list keyed by `DATACACHE.SYSTEM.HISTORY_SIGNATURES_<id>` (capped at 10). Surfaces in the "signature history" UI without needing an audit table.

**`isDrifter()`** — drifter system detection used to flag the C13 drifter holes for specialized UI treatment.

### 9.3 `ConnectionModel` — `connection`

File: [app/Model/Pathfinder/ConnectionModel.php](../../app/Model/Pathfinder/ConnectionModel.php). Extends `AbstractMapTrackingModel`.

An edge between two systems on a map.

| Field                | Type         | Default | Activity-log | Relation                                          | Notes                                                           |
| -------------------- | ------------ | ------- | ------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| `active`             | DT_BOOL      | 1       |              |                                                   |                                                                 |
| `mapId`              | DT_INT       |         |              | belongs-to MapModel, ON DELETE CASCADE            |                                                                 |
| `source`             | DT_INT       |         | ✓            | belongs-to SystemModel[source], ON DELETE CASCADE | system PK                                                       |
| `target`             | DT_INT       |         | ✓            | belongs-to SystemModel[target], ON DELETE CASCADE | system PK                                                       |
| `scope`              | VARCHAR128   | `''`    | ✓            |                                                   | wh / stargate / jumpbridge / abyssal — see ConnectionScopeModel |
| `type`               | JSON         |         | ✓            |                                                   | array of flags — see whitelist below                            |
| `sourceEndpointType` | JSON         |         | ✓            |                                                   | endpoint shape (jsPlumb anchor / endpoint kind)                 |
| `targetEndpointType` | JSON         |         | ✓            |                                                   | endpoint shape                                                  |
| `eolUpdated`         | DT_TIMESTAMP | null    |              |                                                   | when EOL flag was first set                                     |
| `signatures`         | has-many     |         |              | SystemSignatureModel[connectionId]                | both ends share connection                                      |
| `connectionLog`      | has-many     |         |              | ConnectionLogModel[connectionId]                  | jump-mass record                                                |

**`$connectionTypeWhitelist`** ([ConnectionModel.php]):

- Base scopes: `abyssal`, `jumpbridge`, `stargate`.
- Wormhole mass reduction: `wh_fresh`, `wh_reduced`, `wh_critical`.
- Wormhole jump-mass class: `wh_jump_mass_s`, `wh_jump_mass_m`, `wh_jump_mass_l`, `wh_jump_mass_xl`.
- Other WH flags: `wh_eol`, `preserve_mass`, `wh_rolling`.

Frigate-hole and K162 distinctions live in `sourceEndpointType`/`targetEndpointType` plus the linked signature's wormhole type (Stage G).

**`set_type(array)`** validates against the whitelist; setting `wh_eol` for the first time stamps `eolUpdated`. Stage D's `Cron\AbstractCron::deleteEolConnections` uses `eolUpdated` to garbage-collect.

### 9.4 `SystemSignatureModel` — `system_signature`

File: [app/Model/Pathfinder/SystemSignatureModel.php](../../app/Model/Pathfinder/SystemSignatureModel.php). Extends `AbstractMapTrackingModel`.

| Field          | Type       | Default | Activity-log | Relation                                      |
| -------------- | ---------- | ------- | ------------ | --------------------------------------------- |
| `active`       | DT_BOOL    | 1       |              |                                               |
| `systemId`     | DT_INT     |         |              | belongs-to SystemModel, ON DELETE CASCADE     |
| `groupId`      | DT_INT     | 0       | ✓            |                                               |
| `typeId`       | DT_INT     | 0       | ✓            |                                               |
| `connectionId` | DT_INT     |         | ✓            | belongs-to ConnectionModel, ON DELETE CASCADE |
| `name`         | VARCHAR128 | `''`    | ✓            | validate                                      |
| `description`  | VARCHAR512 | `''`    | ✓            |                                               |

**`set_connectionId`** validates that the connection belongs to the same map and touches the signature's system — preventing cross-map link bugs.

### 9.5 `CharacterModel` — `character`

File: [app/Model/Pathfinder/CharacterModel.php](../../app/Model/Pathfinder/CharacterModel.php). Extends `AbstractPathfinderModel` (not Tracking — characters aren't audit-logged into the activity log).

| Field                      | Type         | Default                | Notes                                                      |
| -------------------------- | ------------ | ---------------------- | ---------------------------------------------------------- |
| `lastLogin`                | DT_TIMESTAMP |                        |                                                            |
| `active`                   | DT_BOOL      | 1                      |                                                            |
| `name`                     | VARCHAR128   | `''`                   |                                                            |
| `ownerHash`                | VARCHAR128   | `''`                   | from SSO; detects character transfer                       |
| `esiAccessToken`           | DT_TEXT      |                        | short-lived ESI bearer; encrypted-at-rest in newer commits |
| `esiAccessTokenExpires`    | DT_TIMESTAMP | `DF_CURRENT_TIMESTAMP` |                                                            |
| `esiRefreshToken`          | VARCHAR256   |                        | long-lived; required for background refresh                |
| `esiScopes`                | JSON         |                        | array of granted scopes                                    |
| `corporationId`            | DT_INT       |                        | belongs-to CorporationModel, ON DELETE SET NULL            |
| `allianceId`               | DT_INT       |                        | belongs-to AllianceModel, ON DELETE SET NULL               |
| `roleId`                   | DT_INT       | 1                      | belongs-to RoleModel, ON DELETE CASCADE                    |
| `cloneLocationId`          | DT_BIGINT    |                        | activity-log: ✓ — last known clone location                |
| `cloneLocationType`        | VARCHAR128   | `''`                   | "station" / "structure"                                    |
| `kicked`                   | DT_TIMESTAMP |                        | non-null = kicked                                          |
| `banned`                   | DT_TIMESTAMP |                        | non-null = banned                                          |
| `shared`                   | DT_BOOL      | 0                      | makes character pickable by other users on shared maps     |
| `logLocation`              | DT_BOOL      | 1                      | toggle ESI location polling                                |
| `selectLocation`           | DT_BOOL      | 0                      | auto-select the current system on the map                  |
| `securityStatus`           | DT_FLOAT     | 0                      |                                                            |
| `userCharacter`            | has-one      |                        | UserCharacterModel[characterId]                            |
| `characterLog`             | has-one      |                        | CharacterLogModel[characterId] (1:1)                       |
| `characterMaps`            | has-many     |                        | CharacterMapModel[characterId]                             |
| `characterAuthentications` | has-many     |                        | CharacterAuthenticationModel[characterId]                  |

**`AUTHORIZATION_STATUS` constants** (the gating table for whether a character may use this Pathfinder install):

| Key           | Value                                     |
| ------------- | ----------------------------------------- |
| `OK`          | `true`                                    |
| `UNKNOWN`     | `'error'`                                 |
| `CHARACTER`   | `'failed to match character whitelist'`   |
| `CORPORATION` | `'failed to match corporation whitelist'` |
| `ALLIANCE`    | `'failed to match alliance whitelist'`    |
| `KICKED`      | `'character is kicked'`                   |
| `BANNED`      | `'character is banned'`                   |

Whitelists are configured via `pathfinder.ini` `[PATHFINDER.AUTHENTICATION]` (Stage A).

**Log/cache constants.** `MAX_LOG_HISTORY_DATA = 10`, `TTL_LOG_HISTORY = 79200` (22h), `DATA_CACHE_KEY_LOG = 'LOG'`, `DATA_CACHE_KEY_LOG_HISTORY = 'LOG_HISTORY'`.

### 9.6 `UserModel` — `user`

File: [app/Model/Pathfinder/UserModel.php](../../app/Model/Pathfinder/UserModel.php). Extends `AbstractPathfinderModel`.

| Field            | Type       | Default | Notes                      |
| ---------------- | ---------- | ------- | -------------------------- |
| `active`         | DT_BOOL    | 1       |                            |
| `name`           | VARCHAR128 | `''`    | validate                   |
| `email`          | VARCHAR128 | `''`    | validate (optional SMTP)   |
| `userCharacters` | has-many   |         | UserCharacterModel[userId] |

**Hooks.**

- `beforeInsertEvent` — checks `pathfinder.ini` registration flag; throws `RegistrationException` if registrations are closed.
- `afterEraseEvent` — sends a deletion-confirmation email via SwiftMailer if SMTP is configured.

### 9.7 `CharacterAuthenticationModel` — `character_authentication`

File: [app/Model/Pathfinder/CharacterAuthenticationModel.php](../../app/Model/Pathfinder/CharacterAuthenticationModel.php). Extends `AbstractPathfinderModel`.

Persistent "remember-me" tokens for the character tile grid on login.

| Field         | Type         | Default                | Notes                                               |
| ------------- | ------------ | ---------------------- | --------------------------------------------------- |
| `active`      | DT_BOOL      | 1                      |                                                     |
| `characterId` | DT_INT       |                        | belongs-to CharacterModel, ON DELETE CASCADE        |
| `selector`    | VARCHAR128   | `''`                   | unique, indexed — public part of cookie             |
| `token`       | VARCHAR128   | `''`                   | indexed — secret half (compared with `hash_equals`) |
| `expires`     | DT_TIMESTAMP | `DF_CURRENT_TIMESTAMP` | indexed                                             |

`beforeEraseEvent` clears the matching browser cookie. The selector/token split-cookie pattern is the standard defense against timing attacks; `expires` is swept by `Cron\Auth` (Stage D).

---

## 10. Pathfinder models — audit & activity

### 10.1 `ActivityLogModel` — `activity_log`

File: [app/Model/Pathfinder/ActivityLogModel.php](../../app/Model/Pathfinder/ActivityLogModel.php). Extends `AbstractPathfinderModel`.

Per-character-per-map-per-day counters. One row per `(characterId, mapId, date)` tuple. Used to drive the leaderboard and admin activity dashboards.

| Field                                                        | Type                                                    | Default | Notes                                        |
| ------------------------------------------------------------ | ------------------------------------------------------- | ------- | -------------------------------------------- |
| `active`                                                     | DT_BOOL                                                 | 1       |                                              |
| `characterId`                                                | DT_INT                                                  |         | belongs-to CharacterModel, ON DELETE CASCADE |
| `mapId`                                                      | DT_INT                                                  |         | belongs-to MapModel, ON DELETE SET NULL      |
| `year`, `week`, `dayOfMonth`, `dayOfYear`                    | (smallint date axes — see `addStaticDateFieldConfig()`) |         |                                              |
| `mapCreate` / `mapUpdate` / `mapDelete`                      | DT_SMALLINT                                             | 0       | counter                                      |
| `systemCreate` / `systemUpdate` / `systemDelete`             | DT_SMALLINT                                             | 0       | counter                                      |
| `connectionCreate` / `connectionUpdate` / `connectionDelete` | DT_SMALLINT                                             | 0       | counter                                      |
| `signatureCreate` / `signatureUpdate` / `signatureDelete`    | DT_SMALLINT                                             | 0       | counter                                      |

Counters are incremented in the request-end flush after `AbstractMapTrackingModel::logActivity` buffers entries (§6).

### 10.2 `ConnectionLogModel` — `connection_log`

File: [app/Model/Pathfinder/ConnectionLogModel.php](../../app/Model/Pathfinder/ConnectionLogModel.php). Extends `AbstractPathfinderModel`.

Per-jump record of who jumped through which connection in what ship. Drives the connection-info dialog's "jumps" tab and the mass-reduction calculator.

| Field           | Type       | Notes                                                          |
| --------------- | ---------- | -------------------------------------------------------------- |
| `active`        | DT_BOOL, 1 |                                                                |
| `connectionId`  | DT_INT     | belongs-to ConnectionModel, ON DELETE CASCADE, validate notDry |
| `record`        | DT_BOOL, 1 | soft flag for "include in mass calc"                           |
| `shipTypeId`    | DT_INT     | validate notEmpty — references `eve_universe.type.id`          |
| `shipTypeName`  | VARCHAR128 |                                                                |
| `shipMass`      | DT_FLOAT   | validate notEmpty                                              |
| `characterId`   | DT_INT     | validate notEmpty — plain int, no FK (character may be erased) |
| `characterName` | VARCHAR128 |                                                                |

### 10.3 `CharacterLogModel` — `character_log`

File: [app/Model/Pathfinder/CharacterLogModel.php](../../app/Model/Pathfinder/CharacterLogModel.php). Extends `AbstractPathfinderModel`.

**1:1 with `character`** — exactly one row per active character. Holds the latest ESI-derived location/ship/structure snapshot. Polled by `Cron\Character` (Stage D).

| Field               | Type       | Activity-log | Notes                                                |
| ------------------- | ---------- | ------------ | ---------------------------------------------------- |
| `active`            | DT_BOOL, 1 |              |                                                      |
| `characterId`       | DT_INT     |              | belongs-to CharacterModel, ON DELETE CASCADE, UNIQUE |
| `systemId`          | DT_INT     | ✓            | validate notEmpty                                    |
| `systemName`        | VARCHAR128 | ✓            | validate notEmpty                                    |
| `shipTypeId`        | DT_INT     | ✓            |                                                      |
| `shipTypeName`      | VARCHAR128 | ✓            |                                                      |
| `shipId`            | DT_BIGINT  | ✓            | ESI ship item-id (large)                             |
| `shipMass`          | DT_FLOAT   | ✓            |                                                      |
| `shipName`          | VARCHAR128 |              | pilot-set ship name                                  |
| `stationId`         | DT_INT     | ✓            |                                                      |
| `stationName`       | VARCHAR128 | ✓            |                                                      |
| `structureTypeId`   | DT_INT     | ✓            |                                                      |
| `structureTypeName` | VARCHAR128 | ✓            |                                                      |
| `structureId`       | DT_INT     | ✓            |                                                      |
| `structureName`     | VARCHAR128 | ✓            |                                                      |

Although marked `activity-log: ✓`, this model doesn't extend `AbstractMapTrackingModel`. The annotation is repurposed for the per-character location log (history of recent locations cached on `CharacterModel`); it does not feed `ActivityLogModel`.

---

## 11. Pathfinder models — access & org

### 11.1 `RoleModel` — `role`

File: [app/Model/Pathfinder/RoleModel.php](../../app/Model/Pathfinder/RoleModel.php). Lookup table; `$addStaticFields = true` but the static rows are seeded by `static::$tableData` on `setup()`.

| Field               | Type       | Notes                                    |
| ------------------- | ---------- | ---------------------------------------- |
| `active`            | DT_BOOL, 1 |                                          |
| `name`              | VARCHAR128 | machine key                              |
| `label`             | VARCHAR128 | UI text                                  |
| `level`             | DT_INT     | numeric rank — higher = more privileged  |
| `style`             | VARCHAR128 | CSS modifier (`default`/`danger`/`info`) |
| `corporationRights` | has-many   | CorporationRightModel[roleId]            |

**Static rows** (id, name, label, level, style):

| id  | name        | label   | level | style   |
| --- | ----------- | ------- | ----- | ------- |
| 1   | MEMBER      | Member  | 2     | default |
| 2   | SUPER       | Admin   | 10    | danger  |
| 3   | CORPORATION | Manager | 4     | info    |

### 11.2 `RightModel` — `right`

File: [app/Model/Pathfinder/RightModel.php](../../app/Model/Pathfinder/RightModel.php). Lookup table.

| Field               | Type       | Notes                          |
| ------------------- | ---------- | ------------------------------ |
| `active`            | DT_BOOL, 1 |                                |
| `name`              | VARCHAR128 | unique, indexed                |
| `label`             | VARCHAR128 |                                |
| `description`       | VARCHAR512 |                                |
| `corporationRights` | has-many   | CorporationRightModel[rightId] |

**Static rows.** `map_update`, `map_delete`, `map_import`, `map_export`, `map_share`, `map_create`.

### 11.3 `CorporationRightModel` — `corporation_right`

3-way join: `(corporationId, rightId, roleId)`. For each corporation, defines which **role** (Member / Manager / Admin) is the minimum to exercise each **right** (create / update / share / etc.). The matrix is edited from the per-corporation admin panel.

| Field           | Type       | Notes                                          |
| --------------- | ---------- | ---------------------------------------------- |
| `active`        | DT_BOOL, 1 |                                                |
| `corporationId` | DT_INT     | belongs-to CorporationModel, ON DELETE CASCADE |
| `rightId`       | DT_INT     | belongs-to RightModel, ON DELETE CASCADE       |
| `roleId`        | DT_INT     | belongs-to RoleModel, ON DELETE CASCADE        |

### 11.4 `CorporationModel` — `corporation`

File: [app/Model/Pathfinder/CorporationModel.php](../../app/Model/Pathfinder/CorporationModel.php). The Pathfinder-side corporation. Note that the parallel `Universe/CorporationModel` (§18) holds the CCP-side cache; the two share an `id` (the CCP corporation id) but live in different DBs.

**Constants.**

- `CCP_ROLES` — the full list of in-game corporation role names (director, personnel_manager, security_officer, …).
- `ADMIN_ROLES` — subset that grants Pathfinder admin: `director`, `personnel_manager`, `security_officer`.
- `RIGHTS` — corp-assignable rights: `map_create`, `map_update`, `map_delete`, `map_import`, `map_export`, `map_share`.

Fields include: `active`, `name`, `ticker`, `shared`, plus relations to characters (`has-many`), maps (`has-many` via `corporation_map`), rights (`has-many` via `corporation_right`), structures (`has-many` via `corporation_structure`).

### 11.5 `AllianceModel` — `alliance`

File: [app/Model/Pathfinder/AllianceModel.php](../../app/Model/Pathfinder/AllianceModel.php).

| Field                | Type       | Notes                        |
| -------------------- | ---------- | ---------------------------- |
| `active`             | DT_BOOL, 1 |                              |
| `name`               | VARCHAR128 |                              |
| `ticker`             | VARCHAR128 |                              |
| `shared`             | DT_BOOL, 0 |                              |
| `allianceCharacters` | has-many   | CharacterModel[allianceId]   |
| `mapAlliances`       | has-many   | AllianceMapModel[allianceId] |

`beforeUpdateEvent` touches `updated` regardless to keep the freshness window fresh — same pattern as Universe models.

### 11.6 `StructureModel` — `structure`

Pathfinder-side player structure (citadel/refinery) attached to a system.

| Field                   | Type       | Notes                                                                 |
| ----------------------- | ---------- | --------------------------------------------------------------------- |
| `active`                | DT_BOOL, 1 |                                                                       |
| `structureId`           | DT_INT     | ESI structure id (passed through `set_structureId` which maps 0→null) |
| `corporationId`         | DT_INT     | belongs-to CorporationModel, ON DELETE SET NULL                       |
| `systemId`              | DT_INT     | validate — cross-DB ref to `eve_universe.system.id`                   |
| `statusId`              | DT_INT, 1  | belongs-to StructureStatusModel, ON DELETE SET NULL                   |
| `name`                  | VARCHAR128 |                                                                       |
| `description`           | VARCHAR512 |                                                                       |
| `structureCorporations` | has-many   | CorporationStructureModel[structureId]                                |

### 11.7 `StructureStatusModel` — `structure_status`

Lookup. Rows: `unknown` / `online` / `offline` (with CSS class modifiers `pf-structure-status-*`).

### 11.8 `CharacterStatusModel` — `character_status`

Lookup. Rows: `corporation` / `alliance` / `own` (drives the per-character avatar color in the system local list).

### 11.9 `CorporationStructureModel` — `corporation_structure`

Join: `(corporationId, structureId)`, both ON DELETE CASCADE. Compound UNIQUE.

---

## 12. Pathfinder models — join tables

| Model                 | Table             | Joins                     | On-delete                                                                                                                                                   |
| --------------------- | ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CharacterMapModel`   | `character_map`   | `characterId` ↔ `mapId`   | CASCADE both sides; compound UNIQUE                                                                                                                         |
| `CorporationMapModel` | `corporation_map` | `corporationId` ↔ `mapId` | CASCADE both sides; compound UNIQUE                                                                                                                         |
| `AllianceMapModel`    | `alliance_map`    | `allianceId` ↔ `mapId`    | CASCADE both sides; compound UNIQUE                                                                                                                         |
| `UserCharacterModel`  | `user_character`  | `userId` ↔ `characterId`  | CASCADE both sides; `characterId` UNIQUE — a character belongs to exactly one user; `afterEraseEvent` deletes the parent user if no other characters remain |

`CharacterMapModel::clearCacheData()` cascades the parent `MapModel::DATA_CACHE_KEY_CHARACTER` cache so the live-pilot list refreshes.

---

## 13. Pathfinder models — lookup / static

These models set `addStaticFields = ...` per case but most do keep `created/updated`. They are seeded via `static::$tableData` on `setup()` and re-imported from `export/csv/` if `$enableDataImport = true`.

| Model                  | Table              | Static rows                                                                                                                                                           |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapTypeModel`         | `map_type`         | standard, private, corporation, alliance, global                                                                                                                      |
| `MapScopeModel`        | `map_scope`        | wh, k-space, none, all                                                                                                                                                |
| `SystemTypeModel`      | `system_type`      | w-space, k-space, a-space                                                                                                                                             |
| `SystemStatusModel`    | `system_status`    | unknown, friendly, occupied, hostile, empty, unscanned (with CSS classes)                                                                                             |
| `ConnectionScopeModel` | `connection_scope` | wh (Bezier curviness 40), stargate (Flowchart), jumpbridge (Straight), abyssal (Straight) — **`connectorDefinition` column stores the jsPlumb connector JSON inline** |
| `StructureStatusModel` | `structure_status` | unknown / online / offline                                                                                                                                            |
| `CharacterStatusModel` | `character_status` | corporation / alliance / own                                                                                                                                          |

> **Front-end coupling note.** `ConnectionScopeModel.connectorDefinition` ships jsPlumb-specific JSON in the database. If the rebuild swaps the map renderer, this column either becomes legacy or needs an abstraction layer.

---

## 14. Pathfinder models — stats

All four extend `AbstractSystemApiBasicModel` (§7) and share the same shape: `(systemId UNIQUE, lastUpdatedValue, value1..value24, active, created, updated)`. They are refreshed from ESI by `Cron\System::updateJumpsData()` and `updateKillsData()` (Stage D).

| Model                    | Table                   | Source endpoint                       |
| ------------------------ | ----------------------- | ------------------------------------- |
| `SystemJumpModel`        | `system_jumps`          | `getUniverseSystemJumps`              |
| `SystemShipKillModel`    | `system_kills_ships`    | `getUniverseSystemKills` (ship kills) |
| `SystemPodKillModel`     | `system_kills_pods`     | `getUniverseSystemKills` (pod kills)  |
| `SystemFactionKillModel` | `system_kills_factions` | `getUniverseSystemKills` (NPC kills)  |

---

## 15. Pathfinder models — infrastructure

### 15.1 `CronModel` — `cron`

File: [app/Model/Pathfinder/CronModel.php](../../app/Model/Pathfinder/CronModel.php). Per-job state row for the F3 Cron runner (Stage D will detail each job).

| Field                                                                 | Type       | Notes                                                     |
| --------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| `name`                                                                | VARCHAR128 | unique, indexed, validate notEmpty                        |
| `handler`                                                             | VARCHAR256 | unique, indexed, validate notEmpty — `Class\Path::method` |
| `expr`                                                                | VARCHAR128 | crontab expression                                        |
| `isPaused`                                                            | DT_BOOL, 0 | admin can pause                                           |
| `lastExecStart`                                                       | DT_DOUBLE  | microtime                                                 |
| `lastExecEnd`                                                         | DT_DOUBLE  |                                                           |
| `lastExecMemPeak`                                                     | DT_FLOAT   | MB                                                        |
| (additional exec-tracking fields — last status, last exception, etc.) |

**`STATUS` constants** (icon + label):

| key           | icon class           | label            |
| ------------- | -------------------- | ---------------- |
| `unknown`     | warning, question    | unknown          |
| `dbError`     | warning, exclamation | DB error         |
| `notExecuted` | hint, bolt           | not yet executed |
| `notFinished` | danger, clock        | not finished     |
| `inProgress`  | success, play        | in progress      |
| `isPaused`    | warning, pause       | paused           |
| `onHold`      | information, history | on hold          |

### 15.2 `LogModelInterface`

Contract enforced on every model that participates in the activity-log pipeline. See §6.

---

## 16. Universe models — spatial hierarchy

Static EVE data mirrored from ESI. Refreshed by `Cron\Universe` (Stage D). All extend `AbstractUniverseModel` (§8), DB alias `UNIVERSE`.

### 16.1 `RegionModel` — `region`

| Field              | Type        | Notes                |
| ------------------ | ----------- | -------------------- |
| `id`               | DT_INT (PK) | CCP `region_id`      |
| `name`             | VARCHAR128  |                      |
| `description`      | DT_TEXT     | flavor text          |
| `constellations`   | has-many    | ConstellationModel   |
| `systemNeighbours` | has-many    | SystemNeighbourModel |

Source: ESI `getUniverseRegion`.

### 16.2 `ConstellationModel` — `constellation`

| Field         | Type        | Notes                                     |
| ------------- | ----------- | ----------------------------------------- |
| `id`          | DT_INT (PK) | CCP `constellation_id`                    |
| `name`        | VARCHAR128  |                                           |
| `regionId`    | DT_INT      | belongs-to RegionModel, ON DELETE CASCADE |
| `x`, `y`, `z` | DT_BIGINT   | galactic coords                           |

Source: ESI `getUniverseConstellation`.

### 16.3 `SystemModel` — `system`

The single most-loaded universe table. Note the CCP `securityClass` integer is converted at write-time by `set_securityStatus` into Pathfinder's denormalized `security` label (`H`, `L`, `0.0`, `C1`–`C6`, `P`, `A`).

| Field             | Type        | Notes                                                                                                                                           |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | DT_INT (PK) | CCP `system_id`                                                                                                                                 |
| `name`            | VARCHAR128  | **immutable after first load** — `set_name` ignores subsequent changes (defense against the Abyssal name-shuffling that CCP does each downtime) |
| `constellationId` | DT_INT      | belongs-to ConstellationModel, ON DELETE CASCADE                                                                                                |
| `starId`          | DT_INT      | belongs-to StarModel, ON DELETE CASCADE — null for Abyssal (no star)                                                                            |
| `security`        | VARCHAR128  | denormalized: `H`/`L`/`0.0`/`P`/`A`/`C1`–`C6`                                                                                                   |
| `trueSec`         | DT_FLOAT    | derived from `securityStatus`                                                                                                                   |
| `securityStatus`  | DT_DOUBLE   | raw ESI value                                                                                                                                   |
| `securityClass`   | VARCHAR128  | CCP-side text class                                                                                                                             |
| `effect`          | VARCHAR128  | WH effect (Magnetar, Pulsar, …) or null                                                                                                         |
| `x`, `y`, `z`     | DT_BIGINT   |                                                                                                                                                 |

**Has-many / has-one:** `planets`, `statics`, `stargates`, `stations`, `structures`, `neighbour` (1:1), `sovereignty` (1:1), `factionWar` (1:1).

**Special ID ranges noted in code/comments:**

- Constellation `22000001–22000025` ⇒ Abyssal pocket systems. No `starId`, no planets, `security = 'A'`.
- Constellation `23000001` ⇒ Pochven-adjacent pocket systems. `security = 'P'`.
- Name match `/^j(\d{6}|\d{4}-\d)$/i` or `"Thera"` ⇒ wormhole system. (`SystemModel::isWormhole()` style helpers.)

`afterUpdateEvent` calls `buildIndex()` to refresh the `INDEX_UNIVERSE_system_*` cache that powers system search.

### 16.4 `StarModel` — `star`

Fields: `id`, `name`, `typeId` (belongs-to TypeModel, ON DELETE SET NULL), `age`, `radius`, `temperature`, `luminosity`, `spectralClass`. Source: ESI `getUniverseStar`. Optional for Abyssal.

### 16.5 `PlanetModel` — `planet`

Fields: `id`, `name`, `systemId` (CASCADE), `typeId` (SET NULL), `x/y/z`. Source: ESI `getUniversePlanet`. Used for PI, scenery, and the "shattered" detection (all planets typed "(shattered)" ⇒ shattered system).

### 16.6 `StargateModel` — `stargate`

Fields: `id`, `name`, `systemId` (origin, CASCADE), `typeId` (SET NULL), `destinationSystemId` (CASCADE), `x/y/z`. Compound UNIQUE `(systemId, destinationSystemId)`. **Only saved if the destination system exists in DB** (skipped otherwise — see `loadData` early-return).

Source: ESI `getUniverseStargate`. Feeds `SystemNeighbourModel` rebuild (§19).

### 16.7 `StationModel` — `station`

NPC stations (not player structures). Fields include `id`, `name`, `systemId`, `typeId`, `corporationId` (NPC owner), `raceId`, `services` (JSON), `x/y/z`. Source: ESI `getUniverseStation`. Missing IDs receive a dummy `{id:0, name:"unknown"}` shape rather than raising.

### 16.8 `StructureModel` — `structure` (universe-side)

Player-owned structures. `id` is widened to `BIGINT` in `setup()` because ESI structure IDs exceed INT32. Fields: `id`, `name`, `systemId`, `typeId`, `x/y/z` (FLOAT — higher precision than stations).

Source: ESI `getUniverseStructure` — **requires an access token with `esi-universe.read_structures.v1`**. Access is per-character; structures invisible to the requesting character return 403 and are not cached. (Stage E will detail.)

---

## 17. Universe models — items & dogma

### 17.1 `CategoryModel` — `category`

Top-level item classification (Ship, Module, Celestial, Structure…). Fields: `id`, `name`, `published`. Source: ESI `getUniverseCategory(/ies)`.

### 17.2 `GroupModel` — `group`

Mid-level grouping (Assault Ships, Wormholes, Ammo…). Fields: `id`, `name`, `published`, `categoryId` (CASCADE). Source: `getUniverseGroup(s)`.

### 17.3 `TypeModel` — `type`

The universal item registry. Critical for wormhole-type decoding.

| Field            | Type       | Notes                                                    |
| ---------------- | ---------- | -------------------------------------------------------- |
| `id`             | DT_INT     | PK; CCP `type_id`                                        |
| `name`           | VARCHAR128 | "Rifter", "C540", "Keepstar"                             |
| `description`    | DT_TEXT    |                                                          |
| `published`      | DT_BOOL, 1 |                                                          |
| `radius`         | DT_FLOAT   |                                                          |
| `volume`         | DT_FLOAT   |                                                          |
| `capacity`       | DT_FLOAT   |                                                          |
| `mass`           | DT_FLOAT   |                                                          |
| `groupId`        | DT_INT     | belongs-to GroupModel, ON DELETE CASCADE                 |
| `marketGroupId`  | DT_INT, 0  | denormalized                                             |
| `packagedVolume` | DT_FLOAT   |                                                          |
| `portionSize`    | DT_INT, 0  |                                                          |
| `graphicId`      | DT_INT, 0  |                                                          |
| `attributes`     | has-many   | TypeAttributeModel                                       |
| (back-refs)      |            | stations, structures, planets, stars, stargates, statics |

**`getWormholeData()`** returns `{name, static (targetClass), security, massTotal, massIndividual, maxStableTime, massRegeneration, scanWormholeStrength}` by reading dogma attributes:

| Attr ID | Meaning                   |
| ------- | ------------------------- |
| 1381    | wormholeTargetSystemClass |
| 1382    | wormholeMaxStableTime     |
| 1383    | wormholeMaxStableMass     |
| 1384    | wormholeMassRegeneration  |
| 1385    | wormholeMaxJumpMass       |
| 3974    | scanWormholeStrength      |

Attribute 3974 is often **missing or stale** in ESI; `manipulateDogmaAttributes()` injects the value from `export/csv/wormhole.csv` (§21) as an override.

**`formatWormholeName(?string $name)`** — extracts the 4-character WH code (e.g. `A239`) from the full type name (`"Class 2 Wormhole A239"`).

Source: ESI `getUniverseType` (includes `dogma_attributes` array). Dogma attribute sync runs in `afterInsertEvent` / `afterUpdateEvent` (`syncDogmaAttributes`).

### 17.4 `DogmaAttributeModel` — `dogma_attribute`

Attribute definitions. Fields: `id`, `name`, `displayName`, `description`, `published`, `stackable`, `highIsGood`, `defaultValue`, `iconId`, `unitId`. Source: `getDogmaAttribute`.

### 17.5 `TypeAttributeModel` — `type_attribute`

Junction `(typeId, attributeId, value)`. `addStaticFields = false` (no audit cols). Compound UNIQUE `(typeId, attributeId)`. Populated indirectly via `TypeModel`.

---

## 18. Universe models — factions & ownership

### 18.1 `FactionModel` — `faction`

NPC factions (Caldari, Minmatar, Gallente, Amarr + pirate factions). Fields: `id`, `name`, `description`, `sizeFactor`, `stationCount`, `stationSystemCount`. Source: `getUniverseFaction`.

### 18.2 `RaceModel` — `race`

Fields: `id`, `name`, `description`, `factionId` (CASCADE). Source: `getUniverseRace`.

### 18.3 `AllianceModel` — `alliance` (universe-side)

CCP-side mirror; shares the `id` with `pathfinder.alliance.id` (no cross-DB FK). Fields: `id`, `name`, `ticker`, `dateFounded`, `factionId` (SET NULL — alliances rarely have a militia faction). Source: `getAlliance`.

### 18.4 `CorporationModel` — `corporation` (universe-side)

Fields: `id`, `name`, `ticker`, `dateFounded`, `memberCount`, `isNPC`, `factionId` (SET NULL — NPC owner faction), `allianceId` (SET NULL). NPC detection runs against `getNpcCorporations`. Source: `getCorporation`, `getNpcCorporations`.

### 18.5 `SovereigntyMapModel` — `sovereignty_map`

`addStaticFields = false`. One row per sovereign null-sec system. Fields: `id`, `systemId` (UNIQUE, CASCADE), `factionId` (CASCADE — for low-sec faction militia control), `allianceId` (CASCADE — for null-sec ownership), `corporationId` (CASCADE — for corp-level sov). Either `factionId` is set XOR (`allianceId`/`corporationId`) are set. Refreshed by `Cron\Universe::updateSovereigntyData` from `getSovereigntyMap`.

### 18.6 `FactionWarSystemModel` — `faction_war_system`

`addStaticFields = false`. Per-system faction-warfare state. Fields: `systemId` (UNIQUE, CASCADE), `ownerFactionId` (CASCADE), `occupierFactionId` (CASCADE), `contested` (VARCHAR128 — CCP returns text like `"contested"` not bool), `victoryPoints`, `victoryPointsThreshold`. `getVictoryPercentage()` = `100 / threshold * points`. Source: ESI faction-warfare endpoints, refreshed by `Cron\Universe`.

---

## 19. Universe models — routing

### 19.1 `SystemNeighbourModel` — `system_neighbour`

Pre-computed adjacency list backing the route planner. `addStaticFields = false`, `allowTruncate = true` (cleared and rebuilt wholesale).

| Field             | Type        | Notes                                                                   |
| ----------------- | ----------- | ----------------------------------------------------------------------- |
| `id`              | DT_INT (PK) |                                                                         |
| `regionId`        | DT_INT      | belongs-to RegionModel, CASCADE                                         |
| `constellationId` | DT_INT      | belongs-to ConstellationModel, CASCADE                                  |
| `systemId`        | DT_INT      | belongs-to SystemModel, CASCADE, UNIQUE                                 |
| `systemName`      | VARCHAR128  | denormalized                                                            |
| `jumpNodes`       | VARCHAR512  | **pipe-delimited** neighbor system IDs (e.g. `30000142\|30000143\|...`) |
| `trueSec`         | DECIMAL     | denormalized                                                            |

`loadData` is not implemented — this table is rebuilt by an external script when stargates change (CCP's downtime). The route worker (Stage F) walks `jumpNodes` BFS-style.

> **Schema smell.** Pipe-delimited list in a VARCHAR512 — works for the average system but caps neighbour count and prevents indexed graph queries. The rebuild should use a proper edge table.

### 19.2 `SystemStaticModel` — `system_static`

Wormhole **static** spawns per system. `addStaticFields = false`. Fields: `id`, `systemId` (CASCADE), `typeId` (CASCADE — wormhole type from `type` table). Compound UNIQUE `(systemId, typeId)`. `getData()` returns the wormhole name via `typeId->getWormholeName()`.

CSV source: `export/csv/system_static.csv` (3771 rows). Loaded with `importStaticData()`.

---

## 20. `app/Db/` schema helpers

Directory: [app/Db/Sql/Mysql/](../../app/Db/Sql/Mysql/). Thin extensions of F3's schema layer to add foreign-key constraint support (F3 core's schema doesn't natively manage FKs).

| File                                                            | Role                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`TableModifier.php`](../../app/Db/Sql/Mysql/TableModifier.php) | Extends `\DB\SQL\Schema\TableModifier`. Adds `listConstraint()`, `constraintExists()`, `addConstraint()`, `dropConstraint()`. Used by `AbstractModel::getTableModifier()` and by `setup()` to emit `ALTER TABLE … ADD CONSTRAINT …`.                                                                                                         |
| [`Column.php`](../../app/Db/Sql/Mysql/Column.php)               | Per-column FK helpers; delegates back to `TableModifier`.                                                                                                                                                                                                                                                                                    |
| [`Constraint.php`](../../app/Db/Sql/Mysql/Constraint.php)       | Constraint metadata + DDL generation.                                                                                                                                                                                                                                                                                                        |
| [`Session.php`](../../app/Db/Sql/Mysql/Session.php)             | Extends F3's `\DB\SQL\Session` to override the default DDL (the default uses `TEXT` for `data`; this version uses `MEDIUMTEXT` to allow larger session blobs). Creates the `sessions` table inside the **PF** DB on first instantiation: `(session_id VARCHAR(255) PK, data MEDIUMTEXT, ip VARCHAR(45), agent VARCHAR(300), stamp INT(11))`. |

The `sessions` table is the only table in the application **not** managed by a Cortex model — it's created and accessed by F3's session handler directly. Session pruning relies on F3's built-in suspect-handler callback, not a Pathfinder cron job.

---

## 21. Bootstrap data files

| File                                     | Size              | Role                                                                                                                                                             |
| ---------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export/sql/eve_universe.sql.zip`        | 4.0 MB            | DDL + minimal seed for the `eve_universe` schema. Unzipped on first install; populated incrementally from ESI by `Cron\Universe`.                                |
| `export/sql/pochven_and_trailblazer.sql` | 65 KB             | Patch SQL for Pochven region (introduced post-CCP "Triglavian" expansion) and Trailblazer wormhole types. Applied as a one-off migration.                        |
| `export/sql/zarzakh.sql`                 | 7.5 KB            | Patch SQL for the Zarzakh special system.                                                                                                                        |
| `export/csv/system_static.csv`           | 76 KB / 3771 rows | Wormhole statics per W-space system. `id;systemId;typeId` (`;` delimiter). Loaded into `system_static` via `SystemStaticModel::importStaticData`.                |
| `export/csv/wormhole.csv`                | 1 KB / 88 rows    | Per-wormhole-type override of `scanWormholeStrength` dogma attribute (3974). `Id;Name;scanWormholeStrength`. Injected by `TypeModel::manipulateDogmaAttributes`. |

The `eve_universe.sql` archive is **DDL only** — no static data ships in it. A fresh install creates empty universe tables; the first time a request resolves an unknown `systemId`, `AbstractUniverseModel::loadById` fetches from ESI. Many groups bootstrap by running a full `Cron\Universe::updateUniverseData` job overnight to backfill before opening to users.

---

## 22. Known issues / quirks

1. **Cross-DB references are not enforced.** `pathfinder.system.systemId`, `connection_log.shipTypeId`, `character_log.systemId`, `structure.systemId`, etc. all carry CCP IDs that reference the `eve_universe` schema but have no foreign key. Orphaned references survive a Universe reload.
2. **Activity-log CASCADE chain is destructive.** `AbstractMapTrackingModel.createdCharacterId` has `ON DELETE CASCADE`. Erasing a character (rare but possible from the admin panel) cascade-deletes every map / system / connection / signature they ever created. Kicked/banned characters are _not_ erased — that's why this hasn't bitten production.
3. **Sessions live in the PF DB.** `sessions` is on the same MySQL connection as the rest of the app. Long sessions inflate the table, and DB latency directly impacts every request. Redis-backed sessions are not configured (see [01-config-and-deployment.md](01-config-and-deployment.md) `SESSION_CACHE`).
4. **`AbstractUniverseModel::CACHE_INDEX_EXPIRE_KEY` = 86400 × 356 × 5.** The `356` is a typo (likely meant `365`). It's been there for years and effectively means "five-ish years"; no realistic effect on behavior.
5. **Rolling 24-slot stats lose granularity beyond 24 h.** `AbstractSystemApiBasicModel` discards anything older than the current 24-hour window. No long-term system-activity history is preserved.
6. **`ConnectionScopeModel.connectorDefinition` ships jsPlumb JSON in the DB.** Front-end-renderer-specific data baked into a schema column. A renderer swap breaks the data, not just the code.
7. **`SystemNeighbourModel.jumpNodes` is a pipe-delimited string.** Not indexable. Rebuilt externally on CCP stargate changes; no incremental update path.
8. **CSV import is destructive.** `importStaticData()` `erase()`s rows not present in the CSV. Importing a partial CSV will wipe the rest of the table.
9. **`set_active` foot-gun guard is process-local.** Across multiple PHP-FPM workers, the `$allowActiveChange` flag is per-instance only — not a real ACL.
10. **`Cortex` minimum-stability dev + pinned commit hash.** See [00-overview.md §Known issues / quirks](00-overview.md). `composer install` against this repo can break without notice if vendor patches are rebased.
11. **Wormhole scan-strength via CSV side-channel.** ESI doesn't always populate dogma attribute 3974; `wormhole.csv` is the override path. New wormhole types added by CCP need a CSV update _and_ an ESI refresh.
12. **NPC corporation flag is a one-off bool.** `Universe/CorporationModel.isNPC` is set at load time from a separate ESI call (`getNpcCorporations`) — if a corp's status changes, only a `Cron\Universe` pass updates it.

---

## 23. Open questions

- **`LogModelInterface::getMap()` callers.** Where is this method actually invoked? The interface mandates it, but a grep across `Lib/Logging/*` is needed to confirm the activity-log flush path uses it (Stage D will resolve).
- **`CorporationModel::RIGHTS` constant vs. `RightModel::$tableData`.** The corp-side allow-list duplicates the static rights table; ensure they stay in sync after additions.
- **`ConnectionModel.type` JSON shape.** The whitelist enumerates ~12 flag tokens, but no schema guarantees uniqueness inside the JSON array or rejects mutually-exclusive combinations (`wh_fresh` + `wh_critical`). Validation lives in the UI layer.
- **`CharacterModel.cloneLocationType`.** Only `"station"` and `"structure"` observed; no enum constraint. Other CCP location types (`"solar_system"`?) would silently round-trip.
- **`AllianceModel.shared`** on PF vs. UNIVERSE side. The PF-side `shared` flag is meaningful for map access; the UNIVERSE-side row has no such flag. The "shared" semantic is Pathfinder-only.
- **Pochven (`P`) and Abyssal (`A`) security labels** are derived but not centrally documented. A constant table or enum class would prevent drift.
  **A:** P and A were introduced to the game after Pathfinder was initially created. Support for these system types was introduced as a patch, which explains the lack of documentation.
- **`CronModel` exec-tracking fields** beyond what's listed — full list deferred to Stage D where each job is documented.
- **`Universe/StructureModel` and orphaned access tokens.** When the only character that could read a structure's name gets kicked, the row stays around but the next `Cron\Universe` refresh sees 403; behavior is "keep stale data" — desirable? (Likely yes; worth confirming.)
  **A:** Keep stale data is desirable.

---

## Verification (Stage B self-check)

1. **Critical files coverage.** ✓
   - `AbstractModel.php`, `AbstractPathfinderModel.php`, `AbstractMapTrackingModel.php`, `AbstractSystemApiBasicModel.php`, `AbstractUniverseModel.php`, `LogModelInterface.php` — each directly read and described.
   - All 35 `app/Model/Pathfinder/*.php` enumerated by name with table + key fields (core entities get full field tables; lookup tables get a single-row summary with static-data list).
   - All 22 `app/Model/Universe/*.php` enumerated by name with table + key fields.
   - `app/Db/Sql/Mysql/{TableModifier,Column,Constraint,Session}.php` — §20.
   - `export/sql/eve_universe.sql.zip`, sibling `.sql` patches, `export/csv/*.csv` — §21.
2. **Public entry points.** Every model class appears as a section heading with at least table name + field list (lookup tables consolidated in §13).
3. **Open questions** captured in §23 — not silently dropped.
4. **Feature matrix update.** Cross-references on map-level Slack/Discord webhook persistence and per-map history/activity toggles surface in `MapModel` (§9.1); the existing rows in [10-feature-matrix.md](10-feature-matrix.md) for these features can be linked to `MapModel`'s field table here. (Stage I will close out the full cross-link audit; opportunistic edits this stage are limited to filling the **DB** column for rows already in the matrix.)
