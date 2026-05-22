## wormholeTypes.ts

**Purpose:** Wormhole-catalog lookups for SPEC §6.4 — class-filtered WH-type suggestion and connection "mark as static" matching.
**File:** `src/lib/map/wormholeTypes.ts`

> **Class join key:** `universe_system.security` (the `C1`–`C6` / `HS` / `LS` / `NS` labels), **not** `universe_system.security_class`. SPEC §6.4 pins the catalog's `source_class`/`target_class` to "the same labels as `universe_system.security`", and the seeded catalog + the read-path tests use exactly those. (The Stage 9 plan text says `securityClass`; that is the unrelated SDE ore-spawn field and would never match the catalog — `security` is correct.)

---

### wormholeTypesForSystem(systemId: number): Promise<WormholeTypeOption[]>
Returns the wormhole types that can appear in `systemId`, for the WH-type dropdown. Reads the system's `security` class label, then selects every `universe_wormhole` row where `source_class IS NULL` (appears anywhere — covers the universal `K162`) or `source_class = <class>`, ordered by code. Unknown `systemId` → `[]`. A system with a null `security` returns only the null-source (universal) rows.

**Returns:** `WormholeTypeOption[]` — `{ typeId, name, sourceClass, targetClass }`.

---

### staticMatchForConnection(args): Promise<StaticMatch[]>
"Mark as static": resolves the target system's `security` class, then matches it against the source system's statics — each `universe_system_static` row joined to `universe_wormhole.target_class`. Returns every static whose destination class equals the target system's class (a system may hold several). Empty when nothing matches or the target class is unknown.

**Parameters:**
- `args.sourceSystemId` — system the connection leaves from (whose statics are checked).
- `args.targetSystemId` — system the connection leads into.

**Returns:** `StaticMatch[]` — `{ typeId, name, targetClass }`.

---

### type WormholeTypeOption / StaticMatch
Result shapes for the two lookups. Re-exported from `src/types/index.ts`.

### Depends On
- `universeSystem`, `universeSystemStatic`, `universeWormhole` (Drizzle schema). The static→catalog join mirrors `loadMap.ts` `loadStatics`.
