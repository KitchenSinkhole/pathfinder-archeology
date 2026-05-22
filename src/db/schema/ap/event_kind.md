## event_kind.ts

**Purpose:** The `ap_event_kind` lookup table — the catalog of valid `ap_map_event.kind` values, grouped by category for admin-UI filtering.
**File:** `src/db/schema/ap/event_kind.ts`

---

### apEventKind
`pgTable('ap_event_kind', …)`:
- `kind` — `text` PK, e.g. `system.added`, `connection.create`, `signature.update`.
- `category` — `text`, required; groups kinds for the history UI (`system` | `connection` | `signature` | `map`).

Seed rows are inserted by the Stage 6 migration (`0004_map_schema.sql`), not at runtime.
