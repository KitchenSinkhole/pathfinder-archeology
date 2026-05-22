## page.tsx (maps list)

**Purpose:** Authenticated landing at `/maps` — greets the active character and lists viewable maps as cards linking to the read-only map view.
**File:** `src/app/(app)/maps/page.tsx`

### Renders
A "Maps" heading + "Signed in as {name}" line with a `CreateMapDialog` ("New map") trigger in the header row, then a responsive grid of map `Card`s (name + type · scope) linking to `/map/<id>`, each with a `DeleteMapButton` overlaid top-right. Falls back to an empty-state card when there are no maps.

### Behaviour & Interactions
- Server component; reads the active character via `getActiveCharacter` and maps via `listViewableMaps` (all non-soft-deleted maps — interim, pre-permissions).
- The per-card delete button is a sibling of the `Link` (not nested) to keep valid HTML; the card title reserves right padding so it doesn't sit under the button.
- Create / delete mutate via Server Actions that `revalidatePath('/maps')`, so this list re-renders after either.

### Depends On
- `getActiveCharacter` (`src/lib/session.ts`), `listViewableMaps` (`src/lib/map/loadMap.ts`), `Card` UI primitive, `CreateMapDialog` + `DeleteMapButton` (`src/components/maps/*`).
