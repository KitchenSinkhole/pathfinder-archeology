## SignaturePasteDialog

**Purpose:** Bulk signature-paste modal — parses in-game probe-scanner clipboard text, previews the diff against the current system, lets the user toggle add/update/remove/remove-orphan-connections, and submits via the bulk endpoint.
**File:** `src/components/dialogs/SignaturePasteDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter |
| mapId | string | yes | `ap_map.id` as string |
| mapSystemId | string | yes | `ap_map_system.id` as string |
| existingSigs | MapSignature[] | yes | Sigs on this system (pre-filtered by caller) |
| onResult | (payloads: MapEventPayload[]) => void | yes | Called with the committed events on success — caller registers each `eventId` and applies each payload |

### Renders
A shadcn `Dialog`: header, monospace textarea, preview table (one row per parsed sig + one per to-be-removed existing sig), four option checkboxes, action footer.

### Behaviour & Interactions
- `parseSignaturePaste` runs synchronously on every keystroke; the resolve fetch (`resolveSignaturesOnServer`) is debounced 300 ms and races are dropped via a sequence counter — only the latest paste's resolution wins.
- Preview status per row: ➕ new (when `addMissing` ✓) · ✎ update (when `updateExisting` ✓ AND classification or site name differs) · `?` unresolvable (the Group cell didn't classify into any scanner group) · `·` unchanged. To-be-removed rows render in destructive colour with a 🗑 icon; the link-broken icon appears beside removes whose sig was bound to a connection when `removeOrphanedConnections` ✓.
- "Update existing" applies only when the incoming `groupKey` / `typeId` / `name` is non-null AND differs from existing — incoming nulls never overwrite prior classification (partial re-scans don't blow away known data). For wormhole rows `typeId` is the meaningful diff signal; for cosmic rows the EVE-emitted site name in the Type column is what differs.
- Default option flags: add ✓ / update ✓ / remove ✗ / remove-orphans ✗.
- Closing the dialog (any reason) resets all internal state.

### Emits / Calls
- `resolveSignaturesOnServer({ mapId, rows })` — preview resolver.
- `pasteSignaturesOnServer({ mapId, body })` — submit.
- `onResult(payloads)` — caller's hook into `applyEvent` + `appliedEventIds`.

### Depends On
- `parseSignaturePaste` (`src/lib/map/signatureParser.ts`)
- shadcn `Dialog` primitive (`src/components/ui/dialog.tsx`)
- lucide-react icons (`Plus`, `Pencil`, `Trash2`, `ClipboardPaste`, `HelpCircle`, `Link2Off`)
- `sonner` for the success toast

### Local State
- `text: string` — textarea content
- `parsed: ParsedSigRow[]` — synchronous parse
- `resolved: ResolvedSigRow[]` — server preview
- `options: BulkPasteOptions` — the four flags
- `pending: boolean` — submit in-flight (via `useTransition`)
- `resolveSeq: number` (ref) — debounce + race guard for the resolve fetch
