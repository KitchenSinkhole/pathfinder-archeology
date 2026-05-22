## RouteModule

**Purpose:** Read-only sidebar module showing gate-jump distance from the selected system to the configured trade hubs.
**File:** `src/components/sidebar/RouteModule.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Selected system, or null when none selected. |
| routes | HubRoute[] \| undefined | yes | Hub jumps for the selected system. |

### Renders
A `Card` listing each hub with its jump count (`— ` when no gate route exists, e.g. wormhole space). Prompts to select a system when none is selected.

### Behaviour & Interactions
- Fully read-only; no inputs. Route data is precomputed server-side and passed in.

### Depends On
- `@/components/ui/card`.
