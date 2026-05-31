## applySignaturePaste.ts

**Purpose:** Shared client-side bulk-paste apply (POST → fold payloads → success toast), reused by the paste dialog and the CTRL+V fast-paste hotkey.
**File:** `src/lib/map/applySignaturePaste.ts`

---

### FAST_PASTE_OPTIONS: BulkPasteOptions
Non-destructive defaults for the CTRL+V path: `{ addMissing: true, updateExisting: true, removeMissing: false, removeOrphanedConnections: false }`. The fast path has no preview, so it never removes.

---

### applySignaturePaste(args): Promise<boolean>
POSTs the rows to the bulk endpoint via `pasteSignaturesOnServer`, calls `onResult(payloads)` with the committed event payloads on success, and toasts a summary (`connectionsRemoved` is appended only when > 0). Errors already toast inside the client wrapper.

**Parameters:**
- `mapId` — map id (string).
- `mapSystemId` — target `ap_map_system` id (string).
- `rows` — `ParsedSigRow[]` from `parseSignaturePaste`.
- `options` — optional `BulkPasteOptions`; defaults to `FAST_PASTE_OPTIONS`.
- `onResult` — called with the committed `MapEventPayload[]` so the caller can dedupe + apply locally (e.g. `MapCanvas.onBulkPaste`).

**Returns:** `true` when the paste committed, `false` on error.
