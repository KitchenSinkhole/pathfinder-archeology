## links.ts

**Purpose:** Builds external EVE-related deep links and CCP image URLs.
**File:** `src/lib/integrations/links.ts`

---

### dotlanSystemUrl(systemName: string): string
Returns the DOTLAN system page URL for a solar-system name.

---

### eveeyeSystemUrl(systemId: number): string
Returns an EVEEYE URL centered on a solar-system id.

---

### anoikSystemUrl(systemName: string): string
Returns the Anoik system reference URL for a solar-system name.

---

### zkillboardSystemUrl(systemId: number): string
Returns the zKillboard system page URL.

---

### ccpImageUrl(category: CcpImageCategory, id: number | bigint, variation?: string, size?: number): string
Returns a CCP image-server URL for characters, corporations, alliances, or types.
