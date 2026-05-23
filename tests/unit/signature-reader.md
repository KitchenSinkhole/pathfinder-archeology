## signature-reader.test.ts

**Purpose:** Unit-level coverage of the pure `parseSignaturePaste` parser. The resolver (`resolveSignatureRows`) is server-only and exercised via the integration test (`tests/integration/map-signature-paste.test.ts`).
**File:** `tests/unit/signature-reader.test.ts`

Cases:
- standard 5-column tab-separated paste
- multi-space-separated paste (clipboards that strip tabs)
- header / blank / garbage line skipping
- partial-scan rows (empty name + group cells → both `null`)
- distance `-` accepted as a valid leading cell
- sigId uppercasing + AAA-NNN validation (lowercase passes, malformed skipped)
- empty input / no rows
- trailing whitespace + CRLF tolerance
