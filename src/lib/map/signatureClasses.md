## signatureClasses.ts

**Purpose:** Localized catalog of the EVE probe-scanner "Class" column values (`Cosmic Signature` / `Cosmic Anomaly`) across all six supported client languages, plus helpers to validate/classify a scanned Class cell.
**File:** `src/lib/map/signatureClasses.ts`

The scanner paste's second column is the signature classification, localized to the player's client language. The paste parser matches against this catalog primarily to discard *other* classes of in-game signature (ships, deployables, drones, structures, …) — valid scanner entries that have no place on a wormhole map — and incidentally to reject unrelated tabular text. Adding a client language means appending one row to `SIGNATURE_CLASS_CATALOG`.

Pure and client-safe (no DB, no `server-only`) so the paste dialog can import it. Source: `docs/reference/signature-scan-results.md` §2.

---

### `SIGNATURE_CLASS_CATALOG: readonly SignatureClassOption[]`
One row per language; each carries `lang`, the localized `anomaly` label, and the localized `signature` label.

---

### `signatureClassKind(cell: string | null | undefined): SignatureClassKind | null`
Resolve a scanner-emitted Class cell to `'signature'` | `'anomaly'`, or `null` when empty / unrecognized. Case-insensitive, trimmed.

---

### `isValidSignatureClass(cell: string | null | undefined): boolean`
True when the Class cell matches any known localized signature/anomaly label. Used by `parseSignaturePaste` to filter rows.

---

### Types
- `SignatureClassKind` — `'signature' | 'anomaly'`.
- `SignatureClassOption` — `{ lang, anomaly, signature }`. Re-exported from `src/types/index.ts`.
