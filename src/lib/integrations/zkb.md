## zkb.ts

**Purpose:** zKillboard REST client for read-only recent kill summaries.
**File:** `src/lib/integrations/zkb.ts`

---

### recentKillsForSystem(systemId: number, limit?: number): Promise<RecentKillSummary[]>
Fetches recent kills for one solar system from zKillboard, decodes the response with Zod, honours 420/429 rate-limit responses, and maps killmails into compact sidebar summaries.

**Parameters:**
- `systemId` - EVE solar-system id.
- `limit` - maximum rows returned after decoding.

**Returns:** Recent kill summaries — `killmailId`, ESI `hash`, zKillboard `href`, and zkb `totalValue`. The list endpoint carries nothing else; victim / ship / time / attacker count are resolved from the full ESI killmail (via `hash`) by `@/lib/map/killboard`.

---

### ZkbRateLimitError
Error thrown when zKillboard responds with a rate-limit status.

---

### ZkbHttpError
Error thrown for non-OK, non-rate-limit zKillboard responses.
