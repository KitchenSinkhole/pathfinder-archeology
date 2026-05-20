# 00 — System Overview

**Stage A output.** Sibling docs: [01-config-and-deployment.md](01-config-and-deployment.md), [10-feature-matrix.md](10-feature-matrix.md).

## Purpose

Pathfinder is a collaborative wormhole-mapping web application for **EVE Online**. Pilots use it to chart short-lived wormhole connections (which CCP regenerates on a 24h cycle) across one or more shared maps, attach signature/intel data to systems, and broadcast their location in real time to corp/alliance members.

This document is the entry point for the rebuild spec: it fixes the vocabulary, the stack, and the major moving parts. Every subsequent stage doc assumes the terminology here.

## Surface area

The deployed system is a single PHP application serving:

- A **login page** at `/`.
- A **map application** at `/map*` (single-page-ish — server-rendered shell, RequireJS frontend takes over).
- An **admin panel** at `/admin*`.
- A **first-run installer** at `/setup`.
- An **SSO handoff** at `/sso/<action>` (EVE OAuth2).
- A wildcard **AJAX API** at `/api/<Controller>/<action>[...]` and a **REST API** at `/api/rest/<Controller>[/<id>]`.
- A **TCP socket server** (separate process, react/socket + clue/ndjson-react) for real-time map push. See [04-cron-and-background.md](04-cron-and-background.md) (Stage D — not yet written).

## Stack

| Layer | Choice |
|---|---|
| Web framework | **Fat-Free Framework (F3)** 3.7.x — `bcosca/fatfree-core` |
| ORM | **F3 Cortex** (`ikkez/f3-cortex`, pinned to a dev-master commit) |
| Cron runner | **F3 Cron** (`xfra35/f3-cron`) |
| Language / runtime | **PHP 7.2+ 64-bit** with `pdo`, `openssl`, `curl`, `json`, `mbstring`, `ctype`, `gd` (suggested: `redis`) |
| Primary DB | **MySQL 5.7+**, InnoDB, `utf8mb4` / `utf8mb4_unicode_ci` |
| Static DB | **MySQL** (second schema, `eve_universe`) — EVE static data export |
| Optional 3rd DB | `DB_CCP_*` env vars wired in `environment.ini` but typically unused |
| Cache | Folder (`tmp/cache/`) by default; Redis 3.0+ supported via `cache/redis-adapter` |
| Sessions | MySQL-backed (`SESSION_CACHE = mysql` in `config.ini`) |
| Logging | **Monolog 2** to `logs/` (per-category files, see `[PATHFINDER.LOGFILES]`) |
| Map history | NDJSON files in `history/` (created on demand) |
| Mail | **SwiftMailer 6.2** via SMTP |
| Realtime push | `react/socket` 1.3 + `react/promise-stream` + `clue/ndjson-react` 1.1 |
| JWT | `firebase/php-jwt` 6.x (for ESI/SSO token handling) |
| ESI client | `monoliyoda/pathfinder_esi` (vendored fork; replaces upstream `exodus4d/pathfinder_esi`) |
| Frontend module loader | **RequireJS** (optimized by `gulp-requirejs-optimize`) |
| Frontend libraries | jQuery, **jsPlumb** (map canvas), pnotify, summernote, DataTables |
| Frontend build | **Gulp 4** + `gulp-sass` (dart-sass), autoprefixer, clean-css, uglify, gzip + brotli, imagemin/WebP |
| Node version | 12.x (per `engines` and `requirements.ini`) |
| Server | Apache 2.4 or Nginx 1.9+ |

The PHP namespace is `Exodus4D\Pathfinder\` mapped to `app/` (PSR-4). This is a fork of the original [exodus4d/pathfinder](https://github.com/exodus4d/pathfinder). The deployed fork lives at [thump3d/pathfinder](https://github.com/thump3d/pathfinder) (current version **v2.2.3**).

## Bootstrap

`index.php` is short and worth reading in full to anchor the mental model:

1. `session_name('pathfinder_session')` — cookie name fixed before any session work.
2. Composer autoloader is required (the app refuses to boot without `vendor/`).
3. `\Base::instance()` — Fat-Free Framework singleton.
4. `NAMESPACE = Exodus4D\Pathfinder` is set into the F3 hive so `routes.ini`/`cron.ini` can interpolate `{{ @NAMESPACE }}`.
5. `app/config.ini` is loaded with cascading `true` — pulls in `routes.ini`, `pathfinder.ini` (default and `conf/` override), `plugin.ini` (default and `conf/` override), `requirements.ini`, `cron.ini`.
6. [Lib\\Config](../../app/Lib/Config.php) singleton initializes:
   - environment selection via `environment.ini`'s `ENVIRONMENT.SERVER` → loads `ENVIRONMENT.DEVELOP` or `ENVIRONMENT.PRODUCTION` block;
   - DB connection pool (two-or-three DSNs: `DB_PF_*`, `DB_UNIVERSE_*`, optional `DB_CCP_*`);
   - lazy API client construction (SSO, CCP/ESI, GitHub, Eve-Scout);
   - socket connector pre-check (60s TTL cache on whether the realtime socket is reachable).
7. `Lib\Cron::instance()` registers the jobs from `cron.ini`.
8. `$f3->run()` dispatches the matched route.

## Top-level layout

```
app/
  Controller/    HTTP entry points (page, AJAX, REST, SSO, Setup, Admin)
  Cron/          8 cron classes (~13 active jobs)
  Data/          static lookup data
  Db/            DB schema setup helpers
  Exception/     custom exceptions
  Lib/           Config, Cron loader, socket helpers, resource registry, etc.
  Model/
    Pathfinder/  application models (Map, System, Connection, Character, ...)
    Universe/    static EVE data models (System, Stargate, Region, Type, ...)
  *.ini          config files (see 01-config-and-deployment.md)
conf/            site-local *.ini overrides (gitignored in production)
js/
  app.js         RequireJS configuration
  app/           application JS (init, page entrypoints, map/, ui/, worker/)
  lib/           vendored JS libs
public/
  templates/     Fat-Free server-side templates (PHP-flavored)
  js/, css/, img/  Gulp build output, versioned per release
export/          DB bootstrap (eve_universe.sql.zip) and CSV static-data export
logs/            Monolog output (one file per category)
history/         NDJSON map-history logs (created on demand)
tmp/             template cache, file cache
vendor/          composer
gulpfile.js      asset pipeline
index.php        sole web entry point
```

## EVE Online domain primer

Pathfinder is unintelligible without these terms. They appear unqualified throughout the code, the templates, and the config.

| Term | Meaning |
|---|---|
| **System** | A solar system. Static data row in `eve_universe`. Has security, faction, class. |
| **Region / Constellation** | Geographic groupings of systems (also static data). |
| **K-space** | "Known space" — the contiguous map of high-sec / low-sec / null-sec systems connected by permanent **stargates**. |
| **W-space** | Wormhole space — ~2,600 isolated systems reachable only through transient wormholes. Classified J######. |
| **Wormhole class** | C1 – C6 (regular), C12 (Thera), C13 (shattered/frig), C14–C18 (drifter/special). Drives mass limits, system effects, statics. |
| **System effect** | Anomalous environmental modifier present in some W-space systems (Wolf-Rayet, Pulsar, Cataclysmic Variable, Magnetar, Red Giant, Black Hole). Affects ship stats. |
| **Signature** | Any anomaly/site detected by an onboard scanner. Six characters (e.g. `ABC-123`). Type: combat site, relic, data, gas, ore, **wormhole**. |
| **Wormhole signature** | Signature with type "wormhole" — represents one end of a connection. Has a wormhole **type code** (e.g. `K162`, `C247`) which encodes target class + mass profile. |
| **Connection** | An edge in the map between two systems. Pathfinder distinguishes types: `wh` (wormhole), `jumpbridge`, `stargate`. Wormhole connections carry flags: `mass`, `eol`, `frigate`, `preserve_mass`. |
| **K162** | The "exit side" of any wormhole — generic code shown until the other end is identified. |
| **Mass / EOL** | Wormhole degradation states. Mass: fresh / half / critical (based on tonnage that has jumped). EOL: end-of-life, < ~4h remaining. Both flagged per connection. |
| **Frigate hole** | Sub-class of wormhole that only permits frigate-sized ships. |
| **ESI** | EVE Swagger Interface — CCP's REST API. Pathfinder consumes pilot location, ship type, online status, structures, search, etc. |
| **SSO** | EVE Single Sign-On. OAuth2 + JWT. Required for pilot identity and ESI scopes. See `CCP_ESI_SCOPES` in `environment.ini`. |
| **Tranquility / Singularity** | CCP's production server (`tranquility`) and test server (`singularity`). Selected by `CCP_ESI_DATASOURCE`. |
| **Downtime** | CCP's daily server restart. Configurable as `CCP_SSO_DOWNTIME` (default `11:00` UTC). `Lib\Config::inDownTimeRange` treats `±8m` around this as downtime. ESI calls are expected to fail during this window. |
| **Sovereignty / sov** | Alliance ownership of null-sec systems. Pulled by `Cron\Universe::updateSovereigntyData`. |
| **Faction warfare** | Low-sec PvP system ownership rotation. Static-data domain. |
| **Structure** | Player-built citadel/refinery/etc. Pathfinder queries ESI for accessible structures (scope `esi-universe.read_structures.v1`). |
| **DOTLAN** | Third-party EVE mapping site ([evemaps.dotlan.net](http://evemaps.dotlan.net)) — linked from Pathfinder for jump planning. |
| **zKillboard** | Third-party killmail aggregator ([zkillboard.com](https://zkillboard.com)) — Pathfinder queries it for per-system kill stats. |
| **EVE-Scout** | Third-party API tracking Thera/Turnur connections. Pathfinder pulls "global Thera" data from `api.eve-scout.com/v2/public`. |
| **Anoik.is** | Third-party W-space reference site. Linked from UI. |
| **Thera** | A special C12 wormhole system with many transient connections to K-space. Discovered/maintained by EVE-Scout. Pathfinder has a dedicated "global Thera" module. |

Project-specific terms:

| Term | Meaning |
|---|---|
| **Map** | A user-owned graph of systems + connections. Three scopes: **private** (one character), **corporation**, **alliance**. Each scope has independent limits — see `pathfinder.ini` `[PATHFINDER.MAP.*]`. |
| **Rally point** | Flag on a system meaning "everyone come here." Can trigger Slack / Discord / mail broadcast per `SEND_RALLY_*_ENABLED` flags. |
| **Map history** | Append-only NDJSON log of map mutations in `history/`. Used for audit and the "history" dialog. Truncated periodically by `Cron\MapHistory`. |
| **System tag** | Short user-set label on a system (e.g. for chains). Plugin module — see `plugin.ini` `TAGS`. |
| **Home system** | Per-installation static system ID (`SYSTEMTAG.HOME_SYSTEM_ID`, default `31000376`). Used for connection-count tagging. |
| **Local pilots** | Pilots currently in the same system as the viewer, derived from ESI location calls. Displayed on the map. |

## Dependencies (cross-doc)

- `Lib\Config` is referenced by nearly every controller — see [01-config-and-deployment.md](01-config-and-deployment.md).
- Bootstrap order matters because cron jobs and socket pre-checks are registered before `$f3->run()`. Failures here cause the app to die before serving any route.

## Known issues / quirks (high level)

- **CCP shape-dependence.** Every ESI integration breaks whenever CCP changes endpoints. The `pathfinder_esi` library is vendored as a fork (`monoliyoda/...`) precisely because upstream stalls behind CCP changes. Anything Stage E lists is "as currently observed."
- **Two namespaces of data.** `Pathfinder/` models are mutable user data; `Universe/` models mirror CCP static data. Don't write to `Universe/` from request paths — only `Cron\Universe` and `Cron\CcpSystemsUpdate` should touch it. Tooling that conflates the two has caused incidents historically (see commented `;updateUniverseSystems` / `;setup` jobs in `cron.ini`).
- **Sessions live in MySQL.** This couples request latency to DB health and inflates the table. Be aware before stress-testing.
- **`minimum-stability: dev`** plus a pinned commit hash on `ikkez/f3-cortex` — `composer install` is fragile against upstream churn.
- **Node 12 is EOL.** The build pipeline still runs on it; modern Node may need lockfile work. `gulp-requirejs-optimize` is the most likely friction point.
- **No CSRF token visible in the AJAX API definitions** in `routes.ini` (the throttling args `0, 512` are F3 route throttle params, not security). Auth gating is per-controller via session checks — Stage C will enumerate.

## Open questions

- Are there any production deployments outside the canonical `pathfinder-w.space`? Multi-tenant assumptions in `environment.ini` are missing.
**A:** Pathfinder is made to be self-hosted by groups or organizations in EVE Online.
- Is `DB_CCP_*` (the third DSN block) ever populated in practice, or is it dead config?
- The `clue/ndjson-react` socket server — is it launched by an init script, systemd unit, or via a cron `instant` job? Bootstrap doesn't start it. (Stage D.)
- Whether `Lib\Config::pingDomain` is actually used at runtime or is dead helper code.
- Is the `monoliyoda/pathfinder_esi` fork tracked anywhere with a changelog vs. upstream, or is it ad-hoc patches?
**A:** Ad-hoc patches
