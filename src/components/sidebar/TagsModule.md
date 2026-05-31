## TagsModule

**Purpose:** Sidebar panel showing the next available auto-tags for the active scheme (Stage 17.10).
**File:** `src/components/sidebar/TagsModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| viewData | MapViewData | yes | Live map state; supplies the scheme, systems (tag + class) and connections |
| selectedSystemId | string \| null | yes | `ap_map_system.id` of the selected system, for 0121's per-parent next tag |

### Renders
A compact card. ABC → one row per class (C1–C6 + present classes) with the next 3 letters, decorated `C1(A) C1(B) C1(C)`. 0121 → next root child off Home plus the selected system's next child. Renders nothing when `viewData.map.tagScheme === 'none'`.

### Behaviour & Interactions
- Builds a `TagContext` from `viewData` (client-side, memoised) and calls the **pure** `TAG_STRATEGIES[scheme].availableTags`. Updates live as realtime events fold onto `viewData`.
- Imports only the db-free `registry`/`types` from `src/lib/tagging` — never `service.ts` (which pulls in the db).

### Depends On
- `TAG_STRATEGIES` (`@/lib/tagging/registry`), `TagContext` (`@/lib/tagging/types`).
- `Card` primitives.
