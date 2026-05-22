## page.tsx (maps list)

**Purpose:** Authenticated landing at `/maps` — greets the active character and lists viewable maps as cards linking to the read-only map view.
**File:** `src/app/(app)/maps/page.tsx`

### Renders
A "Maps" heading + "Signed in as {name}" line, then a responsive grid of map `Card`s (name + type · scope) linking to `/map/<id>`. Falls back to an empty-state card when there are no maps.

### Behaviour & Interactions
- Server component; reads the active character via `getActiveCharacter` and maps via `listViewableMaps` (all non-soft-deleted maps — interim, pre-permissions).

### Depends On
- `getActiveCharacter` (`src/lib/session.ts`), `listViewableMaps` (`src/lib/map/loadMap.ts`), `Card` UI primitive.
