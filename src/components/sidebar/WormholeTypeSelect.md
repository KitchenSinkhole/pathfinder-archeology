## WormholeTypeSelect

**Purpose:** Class-filtered wormhole-type dropdown for the signature inspector (SPEC §6.4).
**File:** `src/components/sidebar/WormholeTypeSelect.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` for the active map. |
| universeSystemId | number | yes | EVE solar-system id of the host system; filters the catalog by class. |
| value | number \| null | yes | Selected `universe_wormhole.type_id`, or null when unset. |
| onValueChange | (next: number \| null) => void | yes | Fires when the user picks a different option. |
| disabled | boolean | no | Disables the trigger. |

### Renders
A shadcn `Select` populated with WH codes (e.g. "A239", "K162"). Each option shows `name → targetClass` when known. The first item is a sentinel "Select type…" that maps to `null`.

### Behaviour & Interactions
- On mount and whenever `mapId` / `universeSystemId` change, calls `fetchWormholeTypes` (which caches per `(mapId, universeSystemId)`).
- Disables itself during the initial load.
- Treats the sentinel value `__none__` as null in both directions.

### Depends On
- `Select*` from `@/components/ui/select`
- `fetchWormholeTypes` from `@/lib/map/client`
- `WormholeTypeOption` from `@/types`
