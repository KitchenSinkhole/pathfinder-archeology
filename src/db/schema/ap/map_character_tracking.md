## map_character_tracking.ts

**Purpose:** The `ap_map_character_tracking` join table — "this character's server-side location poll should fold jumps onto this map". Stage 12.0.
**File:** `src/db/schema/ap/map_character_tracking.ts`

---

### apMapCharacterTracking
Drizzle table `ap_map_character_tracking`. Populated as the user opts in/out of tracking from a map UI; the Stage 12.1 location-poll reads it to know where to write detected jumps.

**Columns:**
- `mapId` (`map_id`, `bigint`) — FK → `ap_map.id` `ON DELETE CASCADE`. PK part 1.
- `characterId` (`character_id`, `bigint`) — FK → `ap_character.id` `ON DELETE CASCADE`. PK part 2.
- `startedAt` (`started_at`, `timestamptz`, default `now()`) — when tracking was last enabled. Audit field; not used for scheduling.

**Indexes:**
- PK on `(map_id, character_id)` — natural uniqueness; one tracking row per (map, character) pair.
- `ap_map_character_tracking_character_idx` on `(character_id)` — covers the Stage 12.1 hot-path query "for this character, list every tracked map" the poll handler runs each tick.

**Notes:**
- A character can be tracked on multiple maps simultaneously — matches the legacy `mapIds[]` semantic of `updateUserData` (`docs/spec/03-backend-api.md`). The location-poll fans a single ESI fetch across all rows for that character.
- `ON DELETE CASCADE` on both FKs: hard-deleting either side cleans up the tracking row. Soft-delete of a map (`ap_map.deleted_at`) does NOT remove tracking rows — they're cleared only by the 30-day `map-purge` cascade (Stage 11.2).
- Kick/ban of a character keeps the row (`character_status` change doesn't delete the character row); the Stage 12.1 handler is the one that decides whether to honour a tracking row based on the character's `status`.
- Read-side: the Stage 12.1 handler joins `ap_map_character_tracking` → `ap_map` (filter on `deleted_at IS NULL`) to get the maps the poll should write to. Writes go through `commitMapEvent`.
