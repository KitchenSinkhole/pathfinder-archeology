## guard.ts

**Purpose:** Single authorization chokepoint for structure-intel mutations.
**File:** `src/lib/structures/guard.ts`

---

### requireStructureMutate(session): StructureGuard
Policy: **any authenticated character** may create/edit/delete structure intel (it is deployment-global shared community data). Returns `{ ok: true, characterId }` when the session has a `characterId`, else `{ ok: false, status: 401, error }`. Accountability is enforced by the `ap_structure_event` audit log, not by a write gate. Centralizing the policy here makes a future tightening (e.g. to a corp right) a one-place change.

**Returns:** `StructureGuard = { ok: true; characterId: bigint } | { ok: false; status: 401; error: string }`.
