## MapActionsMenu

**Purpose:** Per-row action surface in `/admin/maps`. Renders the right set of buttons depending on the map's soft-delete state and the actor's authz level.
**File:** `src/components/admin/MapActionsMenu.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| map | AdminMapListItem | yes | The row being acted on; `deletedAt` selects the layout. |
| canPurge | boolean | yes | `true` only for `isAdmin`-true actors. Hides the Purge-now button for managers. |

### Renders
- Active row → `SoftDeleteButton` (trash icon, opens confirm dialog).
- Soft-deleted row → `RestoreButton` (rotate icon, one-click) + (admin only) `PurgeButton` (red trash, type-name confirm).

### Behaviour & Interactions
- `SoftDeleteButton` and `PurgeButton` open `shadcn` `<Dialog>`s; `RestoreButton` fires immediately on click.
- All three call the matching `admin*Map` Server Action via `useTransition`; success/error surface through `sonner` toasts.
- `PurgeButton` requires the user to type the exact map name into the input before the destructive button enables (defence against muscle-memory; matches GitHub repo-delete idiom).
- Closing the purge dialog clears the typed name so reopening starts blank.

### Depends On
- `adminSoftDeleteMap` / `adminRestoreMap` / `adminPurgeMap` — `@/app/(admin)/actions/maps`.
- `Dialog`, `Button`, `Input` — `@/components/ui/*`.
- `AdminMapListItem` — `@/types` (re-exported from `@/lib/map/loadMap`).
