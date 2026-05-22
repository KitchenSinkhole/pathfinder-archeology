## map_event.ts

**Purpose:** The `ap_map_event` table — the append-only, monthly-partitioned audit log that is the single source of every map mutation and the trigger point for realtime fan-out.
**File:** `src/db/schema/ap/map_event.ts`

---

### apMapEvent
`pgTable('ap_map_event', …)`:
- `id` — `bigserial`.
- `map_id` — `bigint` FK → `ap_map.id` `ON DELETE CASCADE` (cascade propagates into partitions).
- `character_id` — `bigint` FK → `ap_character.id` `ON DELETE SET NULL` — audit survives character erasure.
- `occurred_at` — `timestamptz`, required. **Partition key.**
- `kind` — `text`, required; references the `ap_event_kind` catalog by value.
- `payload` — `jsonb`, nullable.

**Primary key:** composite `(id, occurred_at)` — Postgres requires the partition key in the PK.

### Partitioning & trigger (migration-managed)
Drizzle cannot emit partitioned DDL, so `0004_map_schema.sql` hand-writes:
- `CREATE TABLE … PARTITION BY RANGE (occurred_at)` + `partman.create_parent(...)` for monthly partitions.
- `fn_map_event_notify()` + trigger `tg_map_event_notify` (`AFTER INSERT … FOR EACH ROW`) that runs `pg_notify('map:'||map_id, payload)`.

This `.ts` definition exists only for type inference / FK resolution; the live DDL lives in the migration.
