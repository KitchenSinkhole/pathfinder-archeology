## signatureSites.ts

**Purpose:** Single source of truth for EVE cosmic-signature **site names** by system class and group, powering the Type-field auto-suggest in the signature panel.
**File:** `src/lib/map/signatureSites.ts`

The six cosmic groups (Combat/Relic/Data/Gas/Ore/Ghost) have no SDE rows — their site names are baked into the EVE client and can't be DB-resolved — so this hand-maintained TS catalog is the only place they live. Ported from the legacy `docs/spec/signature_type.js`. The Wormhole group is intentionally excluded: wormhole types are DB-backed via `wormholeTypesForSystem` / `WormholeTypeSelect`.

Keyed by the `universe_system.security` label (`MapSystemNode.security`), which already encodes class: `C1`–`C6`, `C12` (Thera), `C13` (Shattered), `C14`–`C18` (Drifter Sentinel/Barbican/Vidette/Conflux/Redoubt), and k-space bands `H` / `L` / `0.0` / `P`. Entries exist only where the legacy data provided them; everything else returns `[]` and the UI falls back to free text.

**Updating:** CCP changes these sites ~2×/year. To update, **edit this file and redeploy** — no migration, no ingest task, no DB write. Isomorphic (no `server-only`); imported directly by the client combobox.

---

### sitesForClassAndGroup(security: string | null, group: CosmicSignatureGroupKey): readonly string[]
Suggested site names for a system's class and a cosmic signature group. Returns `[]` when `security` is null, the class is unknown, or the class has no entries for that group. Results are suggestions only — callers still accept arbitrary free text.

**Parameters:**
- `security` — the system class label (`MapSystemNode.security`, e.g. `'C3'`, `'H'`, `'0.0'`).
- `group` — one of the six cosmic group keys (`combat`/`relic`/`data`/`gas`/`ore`/`ghost`).

**Returns:** A readonly array of site-name strings (possibly empty).
