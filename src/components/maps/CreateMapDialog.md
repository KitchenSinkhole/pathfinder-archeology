## CreateMapDialog

**Purpose:** "New map" button that opens a modal to create a map (name + scope + visibility) via `createMapAction`.
**File:** `src/components/maps/CreateMapDialog.tsx`

### Renders
A primary `Button` trigger ("New map") opening a `Dialog` with a name `Input` and two `Select`s (scope, visibility) plus Cancel / Create actions.

### Behaviour & Interactions
- Client component. Local state for `name` / `scope` (default `wh`) / `type` (default `private`).
- Submit calls `createMapAction({ name, scope, type })` inside `useTransition`; on success: success toast, reset fields, close dialog (the action's `revalidatePath('/maps')` refreshes the list). On error: `toast.error(result.error)`.
- Scope/type option lists are hardcoded here (mirrors the `map_scope` / `map_type` enums) to avoid pulling the Drizzle schema into the client bundle.

### Emits / Calls
- `createMapAction` (`@/app/(app)/actions/map`).

### Depends On
- `Dialog`, `Input`, `Select`, `Button` UI primitives; `sonner` toasts.
