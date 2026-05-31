## zkbFeed.ts

**Purpose:** Server-side zKillboard live-feed consumer — polls the R2Z2 ephemeral feed and fans a transient `systemNotification` to every active map watching the solar system a kill happened in.
**File:** `src/lib/integrations/zkbFeed.ts`

A single long-lived loop, booted from `server.ts` (guarded by `env.ZKB_FEED_ENABLED`), **not** a graphile-worker task — it's one global feed, not per-entity work. The notification carries no map state, so (like the location-poll's `characterUpdate`) it is a direct `pg_notify` on `map:<id>` that **bypasses `ap_map_event`**; `bus.ts` discriminates on the top-level `task`. Clients pulse a red underglow under the node (`MapUnderglowBridge`).

R2Z2 model (the RedisQ replacement): walk `<base>/<seq>.json` upward from a cursor until a 404 (caught up), sleep ≥6s (`ZKB_FEED_POLL_MS`), repeat. The cursor is seeded to the feed's *current* sequence on boot — kills are surfaced live, never backfilled.

---

### startZkbFeed(): void
Starts the loop. Idempotent — a second call while running is a no-op. Resets backoff and kicks the first tick.

### stopZkbFeed(): Promise<void>
Stops the loop: clears the pending tick timer and aborts any in-flight fetch. Called from `server.ts`'s shutdown handler before `stopWorker()`.

### pollOnce(): Promise<{ processed, notified, cursor }>
One feed sweep. On the first call (cursor null) it seeds the cursor from `<base>/sequence.json` and returns without processing (live start). Thereafter it refreshes the active-system index when stale, then fetches `cursor+1 …` until a 404 / non-200 (stops the sweep, retried next tick) or the `ZKB_FEED_MAX_CATCHUP` cap; each killmail is decoded, correlated, and notified. Exported for the loop and tests.

### loadActiveSystemIndex(): Promise<SystemIndex>
Builds the `solarSystemId → Set<mapId>` index from every `visible` system on a non-soft-deleted map (one join over `ap_map_system` × `ap_map`). Same predicate shape as the location-poll's tracked-map lookup.

### correlateKill(kill: ZkbKill, index: SystemIndex): SystemNotificationLoad[]
Pure. Returns one `systemNotification` load per active map watching the kill's `solar_system_id`; `[]` when the kill has no system or nobody is watching. The load's `killmail` carries `killmailId`, `shipTypeId` (victim hull), `totalValue` (zkb ISK), and the zKillboard `href`.

### __resetZkbFeedState(): void
Test seam — resets module singleton state (cursor, index, timers) between cases.

### Types
- `SystemIndex` — `Map<number, Set<bigint>>` (EVE solar-system id → active maps it's on).

### Behaviour & notes
- **Backoff:** a throwing tick (network/timeout, 429) never kills the loop — it backs off (`WS_RECONNECT_BASE_MS`·2^n capped at `WS_RECONNECT_MAX_MS`, floored at `ZKB_FEED_POLL_MS`) and retries. A clean tick resets backoff.
- **404 = caught up:** the cursor is not advanced past a 404, so that sequence is retried next tick.
- **Defensive decode:** accepts both the flat R2Z2 shape (ESI fields + `zkb`) and the legacy nested `{ killmail, zkb }`; an unrecognised shape degrades to "no notification", never a crash.
- Each fetch carries `INTEGRATION_USER_AGENT` (blank UA → zKB 403) and an `INTEGRATION_REQUEST_TIMEOUT_MS` timeout combined with the loop's stop signal.

### Depends On
- `@/db/client` (`db`), `@/db/schema` (`apMap`, `apMapSystem`), `./zkb` (`zkbKillSchema`, `ZkbKill`), `@/lib/realtime/protocol` (`SystemNotificationLoad`), `aperture.config` (feed cadences, base URL, UA, channel prefix), `drizzle-orm`, `zod`.
