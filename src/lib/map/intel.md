## intel.ts

**Purpose:** Builds per-system read-side intel for the map sidebar.
**File:** `src/lib/map/intel.ts`

---

### intelForSystems(systemIds: number[]): Promise<Record<number, SystemIntelSummary>>
Loads sovereignty and faction-warfare state from the universe tables, fetches EVE-Scout connections once, and returns client-serialisable summaries keyed by solar-system id. Recent kills are **not** included here — the `SystemKillboardModule` owns that feed via `/api/system/[id]/killboard`.

External EVE-Scout failures degrade to an empty list so the map still renders; the scheduled ESI refresh job remains the hard-failing path for sov/FW health.

**Parameters:**
- `systemIds` - EVE solar-system ids visible in the map view.

**Returns:** Per-system sovereignty, FW, EVE-Scout, and external-link summaries.
