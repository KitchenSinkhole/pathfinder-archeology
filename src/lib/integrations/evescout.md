## evescout.ts

**Purpose:** EVE-Scout public connection client for Thera / Turnur read-side intel.
**File:** `src/lib/integrations/evescout.ts`

---

### fetchEveScoutConnections(): Promise<EveScoutConnectionSummary[]>
Fetches the public EVE-Scout signature feed, rejects `{ error }` envelopes, decodes rows with Zod, and maps them into compact connection summaries.

**Returns:** Normalised source/target system ids and names, hub classification, signature id, and timestamps.

---

### connectionsForSystem(rows: readonly EveScoutConnectionSummary[], systemId: number): EveScoutConnectionSummary[]
Filters a fetched EVE-Scout connection list to entries touching one solar-system id.

**Parameters:**
- `rows` - decoded EVE-Scout summaries.
- `systemId` - solar-system id to match as source or target.

**Returns:** Matching connection summaries.

---

### EveScoutError
Error thrown for failed HTTP responses or EVE-Scout error envelopes.
