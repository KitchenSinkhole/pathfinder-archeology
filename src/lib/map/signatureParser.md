## signatureParser.ts

**Purpose:** Pure, client-safe parser for EVE probe-scanner clipboard text. Split from `signatureReader.ts` so the parse step can run in the paste dialog (a `'use client'` component) without dragging the DB-bound resolver — which is `server-only` — into the client bundle.
**File:** `src/lib/map/signatureParser.ts`

---

### parseSignaturePaste(text: string): ParsedSigRow[]
Pure splitter — no DB, no `Date.now()`. The EVE probe scanner emits 5 tab-separated columns in fixed order: `Distance, ID, Name, Group, Signal`. Falls back to multi-space splitting for clipboards that strip tabs. Skips blanks, header rows (first cell isn't a Distance), and rows with malformed sigIds. Distance is parsed but discarded — only `sigId`, `name`, `groupName`, `signal` survive.

**Parameters:**
- `text` — raw clipboard string.

**Returns:** `ParsedSigRow[]`.

---

### Types
- `ParsedSigRow = { sigId, name | null, groupName | null, signal | null }`

Re-exported from `src/types/index.ts`.

### Why no WH-type code resolution
The probe scanner *never* emits the wormhole type code (`A239`, `K162`, …) in the paste — that's only knowable after warping in and opening "Show Info" on the WH. The existing `WormholeTypeSelect` dropdown in `SignatureModule` stays the user-driven entry point for the code.
