## MapSettingsDialog

**Purpose:** Consolidated map edit / settings / import-export dialog (Stage 17.6), launched from the `MapCanvas` toolbar.
**File:** `src/components/dialogs/MapSettingsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state. |
| onOpenChange | (open: boolean) => void | yes | Open-state setter. |
| mapId | string | yes | The open map's id. |
| settings | MapSettings | yes | Seed values (name/icon/scope/type + 4 toggles) from `loadMapSettings`. |
| onImported | (payloads: MapEventPayload[]) => void | yes | Folds imported event payloads onto the live canvas (wired to the canvas's `onBulkPaste`). |

### Renders
A four-tab dialog (`Tabs`): **General** (name + icon inputs, read-only scope/visibility), **Settings** (four toggle checkboxes), **Export** (download button), **Import** (file picker).

### Behaviour & Interactions
- General Save → `updateMapSettingsAction({ mapId, name, icon })` (`map_update`); empty icon trims to `null`. A name change reflects live on the canvas via the realtime `map.update` echo.
- Settings Save → `updateMapSettingsAction({ mapId, ...4 toggles })`.
- Export → `exportMapOnServer({ mapId })`; on success builds a `Blob` and triggers a download named `aperture-map-<id>-<YYYY-MM-DD>.json`.
- Import → reads the chosen file, `JSON.parse`s it, posts via `importMapOnServer`; on success calls `onImported(payloads)` and toasts a summary, then resets the file input. Invalid JSON / schema-invalid files toast an error (the client wrapper handles HTTP errors).
- Scope/type are shown read-only (immutable post-create). Webhooks are intentionally absent (admin-only).

### Emits / Calls
- `updateMapSettingsAction`, `exportMapOnServer`, `importMapOnServer`.
- `onImported(payloads)` after a successful import.

### Depends On
- `Dialog`, `Tabs`, `Button`, `Input` primitives; `sonner` toasts; lucide `Download`/`Save`/`Upload`.
