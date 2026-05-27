## SignatureModule

**Purpose:** Standalone full-width signatures panel rendered below the map. Shows the table and create form for the selected system; placeholder when nothing is selected.
**File:** `src/components/sidebar/SignatureModule.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| mapId | string | yes | `ap_map.id` (for the WH-types endpoint and paste dialog). |
| system | MapSystemNode \| null | yes | The selected system; when `null` the panel renders a "select a system" placeholder. |
| signatures | MapSignature[] | yes | All signatures on the map; the module filters by `mapSystemId === system.id`. |
| onCreate | (body: CreateSignatureBody) => void | yes | Called when the user submits the add form. The parent issues the POST. |
| onPatch | (signatureId: string, patch: UpdateSignatureBody) => void | yes | Called for inline edits (type select, name input). |
| onDelete | (signatureId: string) => void | yes | Called from the row trash button. |
| onBulkPaste | (payloads: MapEventPayload[]) => void | yes | Forwarded to `SignaturePasteDialog`; caller registers each `eventId` in its dedupe set and applies each payload locally. |

### Renders
A `Card` with:
- Header row containing the title (`Signatures — <system alias or name>`) and, when a system is selected, a **Paste from scanner** button (opens `SignaturePasteDialog`).
- Body: when no system is selected, a placeholder message. When a system is selected, a wide signature table (Sig / Type / Name / TTL / delete) and an inline add form below. TTL is rendered via `formatRelativeFromMs` (e.g. "23h", "2d", "expired").

### Behaviour & Interactions
- The body re-mounts on system change (`key={system.id}`) so draft state for the add form resets cleanly when the selection changes.
- Filters incoming `signatures` to the current system by `mapSystemId`.
- The add form's `sigId` is auto-uppercased; it's required (the Add button is disabled while empty).
- `expiresAt` for new sigs defaults to `now + apertureConfig.SIGNATURE_DEFAULT_TTL_MS` (legacy 5-day TTL).
- Inline name edits fire `onPatch` on every keystroke; the parent debounces / optimistically applies as needed.
- The **Paste from scanner** button toggles a `SignaturePasteDialog` with the active system pre-bound and the filtered sig list as `existingSigs`.

### Depends On
- `WormholeTypeSelect`
- `SignaturePasteDialog` (`@/components/dialogs/SignaturePasteDialog`)
- `Card`, `Button`, `Input` from `@/components/ui/*`
- `formatRelativeFromMs` from `@/lib/map/relativeTime`
- `apertureConfig` (`SIGNATURE_DEFAULT_TTL_MS`) from `aperture.config`
- Types: `MapEventPayload`, `MapSignature`, `MapSystemNode` from `@/types`; body types from `@/lib/map/client`
