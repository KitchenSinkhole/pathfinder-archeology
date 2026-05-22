## page.tsx (maps list)

**Purpose:** Authenticated landing at `/maps` — greets the active character and renders a placeholder empty-state for the map list (real data lands with the per-map schema in a later stage).
**File:** `src/app/(app)/maps/page.tsx`

### Renders
A "Maps" heading + "Signed in as {name}" line, and an empty-state `Card`.

### Behaviour & Interactions
- Server component; reads the active character via `getActiveCharacter`. No `ap_map` query (the table does not exist yet).

### Depends On
- `getActiveCharacter` (`src/lib/session.ts`), `Card` UI primitive.
