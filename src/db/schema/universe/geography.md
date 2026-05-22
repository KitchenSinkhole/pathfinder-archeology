## geography.ts

**Purpose:** Drizzle tables for EVE spatial hierarchy: regions, constellations, systems, and the directed stargate edge graph.
**File:** `src/db/schema/universe/geography.ts`

Exports: `universeRegion`, `universeConstellation`, `universeSystem`, `universeStargateEdge`.
See `src/db/schema.md` for the column/FK reference. Spatial IDs are `integer`; coords `doublePrecision`. `universeStargateEdge` PK is `(from_system_id, to_system_id)` with an index on `to_system_id` for reverse lookups.
