## system_stats.ts

**Purpose:** Narrow per-system stats time-series (`ap_system_stats`) replacing the legacy 24-column circular buffers; one row per (system, hour).
**File:** `src/db/schema/ap/system_stats.ts`

---

### apSystemStats
Drizzle table `ap_system_stats`. Daily-partitioned by `hour_bucket` via pg_partman (DDL in `0005_system_stats.sql`; this definition is for type inference only).

**Columns:**
- `systemId` (`system_id`, integer) — FK → `universe_system.id` `ON DELETE CASCADE`. PK part 1.
- `hourBucket` (`hour_bucket`, timestamptz) — the hour the counts cover. PK part 2 and partition key.
- `jumps` (integer, default 0) — gate jumps in the hour.
- `shipKills` (`ship_kills`, integer, default 0) — ship kills.
- `podKills` (`pod_kills`, integer, default 0) — pod kills.
- `factionKills` (`faction_kills`, integer, default 0) — NPC/faction kills.

**Notes:** Populated by the Stage 11 stats-refresh job — empty until then. Rolling 24h windows: `WHERE hour_bucket > now() - interval '24 hours'`. Rolloff is `DETACH/DROP PARTITION`, not `DELETE`.
