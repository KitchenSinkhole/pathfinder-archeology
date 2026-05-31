## signature-reader.test.ts

**Purpose:** Unit-level coverage of the pure `parseSignaturePaste` parser. The resolver (`resolveSignatureRows`) is server-only and exercised via the integration test (`tests/integration/map-signature-paste.test.ts`).
**File:** `tests/unit/signature-reader.test.ts`

Format: six tab-separated columns `ID, Class, Group, Name, Signal, Distance` (docs/reference/signature-scan-results.md). Cases:
- standard 6-column tab-separated paste (Case C: blanks, partials, 100%)
- initial 0.0% rows with blank Group/Name (Case A)
- Cosmic Anomaly row (Case D)
- header / blank / garbage line skipping
- localized German Class label accepted
- valid sig id but unrecognized Class → rejected
- sigId uppercasing + AAA-NNN validation (lowercase passes, malformed skipped)
- empty input / no rows
- trailing whitespace + CRLF tolerance
