## security.ts

**Purpose:** Derives Pathfinder's denormalized `security` label for a solar system from SDE static data.
**File:** `src/lib/sde/security.ts`

---

### deriveSecurityLabel(input: SecurityInput): string
Returns the label: `A` (Abyssal, region `[12000000,13000000)`), `P` (Pochven, region `10000070`), `C{n}` (wormhole, region `[11000000,12000000)`, n = constellation `wormholeClassID`), else k-space `H`/`L`/`0.0` from rounded `securityStatus`.

**Parameters:**
- `input.regionId` — system's region id
- `input.wormholeClassId` — constellation `wormholeClassID` or null
- `input.securityStatus` — raw security status or null

**Returns:** The label string. Note empire k-space constellations all share `wormholeClassID = 7`, so hi/lo/null is read from `securityStatus`, not the class.

---

### roundSecurity(securityStatus: number): number
Rounds to one decimal place (EVE convention, e.g. `0.439 → 0.4`, `0.45 → 0.5`).
