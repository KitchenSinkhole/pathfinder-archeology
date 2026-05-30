## IntelModule

**Purpose:** Shows selected-system read-side intel from sovereignty/FW tables and third-party integrations.
**File:** `src/components/sidebar/IntelModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| system | MapSystemNode \| null | yes | Currently selected system, or null when nothing is selected |
| intel | SystemIntelSummary \| undefined | no | Read-side intel keyed by the selected system id |

### Renders
Compact sidebar card with system metadata, sovereignty, faction warfare, EVE-Scout hits, and external links. Recent kills live in the separate `SystemKillboardModule`, not here.

### Behaviour & Interactions
- Empty selected-system state prompts the user to select a system.
- Missing external data renders an empty state instead of blocking the map.
- External links open in a new tab.

### Depends On
- `SystemIntelSummary` - server-computed view model from `src/lib/map/intel.ts`.
- `lucide-react` - external-link icon.
