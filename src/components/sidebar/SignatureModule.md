## SignatureModule

**Purpose:** Signature table + create form for the selected system, embedded in the system inspector.
**File:** `src/components/sidebar/SignatureModule.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` (for the WH-types endpoint). |
| system | MapSystemNode | yes | The selected system; provides `id` (for filtering) and `systemId` (EVE id, for the WH-type catalog query). |
| signatures | MapSignature[] | yes | All signatures on the map; the module filters by `mapSystemId === system.id`. |
| onCreate | (body: CreateSignatureBody) => void | yes | Called when the user submits the add form. The parent issues the POST. |
| onPatch | (signatureId: string, patch: UpdateSignatureBody) => void | yes | Called for inline edits (type select, name input). |
| onDelete | (signatureId: string) => void | yes | Called from the row trash button. |

### Renders
A small header, a table of signatures (Sig / Type / Name / TTL / delete), and an add form below. Each type cell is a `WormholeTypeSelect`. TTL is rendered via `formatRelativeFromMs` (e.g. "23h", "2d", "expired").

### Behaviour & Interactions
- Filters incoming `signatures` to the current system by `mapSystemId`.
- The add form's `sigId` is auto-uppercased; it's required (the Add button is disabled while empty).
- `expiresAt` for new sigs defaults to `now + apertureConfig.SIGNATURE_DEFAULT_TTL_MS` (legacy 5-day TTL).
- Inline name edits fire `onPatch` on every keystroke; the parent debounces / optimistically applies as needed.

### Depends On
- `WormholeTypeSelect`
- `Button`, `Input` from `@/components/ui/*`
- `formatRelativeFromMs` from `@/lib/map/relativeTime`
- `apertureConfig` (`SIGNATURE_DEFAULT_TTL_MS`) from `aperture.config`
- Types: `MapSignature`, `MapSystemNode` from `@/types`; body types from `@/lib/map/client`
