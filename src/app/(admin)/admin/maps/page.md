## AdminMapsPage

**Purpose:** `/admin/maps` — table of every map in the admin's scope (admin: all maps incl. soft-deleted; manager: corp-scoped). Each row exposes the destructive action surface (`MapActionsMenu`).
**File:** `src/app/(admin)/admin/maps/page.tsx`

### Renders
A scope label header and a plain HTML table with columns: Name (linked to `/map/<id>` for active rows, struck-through plain text for soft-deleted), Scope, Type, Owner (formatted from the map's owner FK matching its `type`), Created (Intl-formatted date), Status badge (`Active` / `Soft-deleted <date>`), and an action cell hosting `<MapActionsMenu>`.

### Behaviour & Interactions
- `auth()` then `adminVisibilityScope(session)`; `null` scope redirects to `/maps` (defence in depth — the layout already gated).
- `isAdmin(session)` is resolved in parallel and threaded into every row as `canPurge` so the menu can decide whether to render `Purge now`.
- Server component. No client cache to manage — Server Actions in `MapActionsMenu` `revalidatePath('/admin/maps')` to refresh.

### Depends On
- `auth`, `adminVisibilityScope`, `isAdmin` — `@/lib/auth/rights` / `@/lib/auth`.
- `listAdminMaps` — `@/lib/map/loadMap`.
- `MapActionsMenu` — `@/components/admin/MapActionsMenu`.
