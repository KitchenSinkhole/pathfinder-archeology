## map_tracking_seed.ts

**Purpose:** The `ap_map_tracking_seed` marker table — "this account has already had its tracking auto-seeded on this map", so the per-map default (track all active characters) fires exactly once per `(map, account)`. Per-map-character-tracking plan, Stage 1.
**File:** `src/db/schema/ap/map_tracking_seed.ts`

---

### apMapTrackingSeed
Drizzle table `ap_map_tracking_seed`. One row per `(map, account)` pair, written the first time the account opens (subscribes to) the map.

**Columns:**
- `mapId` (`map_id`, `bigint`) — FK → `ap_map.id` `ON DELETE CASCADE`. PK part 1.
- `userId` (`user_id`, `integer`) — FK → `ap_user.id` `ON DELETE CASCADE`. PK part 2.
- `seededAt` (`seeded_at`, `timestamptz`, default `now()`) — when the auto-seed ran. Audit field.

**Indexes:**
- PK on `(map_id, user_id)` — one marker per (map, account) pair; backs the `ON CONFLICT DO NOTHING` first-open check in `seedTrackingForMap`.

**Notes:**
- Presence of a row means "auto-seed already happened — never auto-add again". Its absence means "never configured — on first open, seed a tracking row for every active account character". This is what lets an empty `ap_map_character_tracking` selection survive (user deselected everyone) without being mistaken for a fresh map.
- `ON DELETE CASCADE` on both FKs: hard-deleting the map or the account cleans up the marker. Map soft-delete (`ap_map.deleted_at`) does not.
- Written/read only by `seedTrackingForMap` (`src/lib/jobs/tracking.ts`).
