## DeleteMapButton

**Purpose:** Per-map trash button with a confirmation modal that soft-deletes the map via `deleteMapAction`.
**File:** `src/components/maps/DeleteMapButton.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` to soft-delete |
| mapName | string | yes | Shown in the confirm copy + toasts |

### Renders
A ghost icon `Button` (trash) that opens a confirm `Dialog` explaining the 30-day grace period, with Cancel / Delete (destructive) actions.

### Behaviour & Interactions
- Client component. Confirm calls `deleteMapAction(mapId)` inside `useTransition`; on success: success toast + close (the action's `revalidatePath('/maps')` drops the map from the list). On error: `toast.error(result.error)`.

### Emits / Calls
- `deleteMapAction` (`@/app/(app)/actions/map`).

### Depends On
- `Dialog`, `Button` UI primitives; `sonner` toasts.
