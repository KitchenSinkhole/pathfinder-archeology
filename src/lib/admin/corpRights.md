## corpRights.ts

**Purpose:** Stage 16.5 read-side helpers for the `/admin/settings` corp-rights matrix. Returns corps an admin/manager may pick from, and the full six-right matrix for a single corp with "missing" rights surfaced as `null`.
**File:** `src/lib/admin/corpRights.ts`

---

### listCorpsForAdmin(scope: AdminVisibilityScope): Promise<AdminCorpRow[]>
Returns corporations the actor may pick in the corp picker.
- `scope.kind === 'global'` (admin) → every `ap_corporation` row, alphabetical by name.
- `scope.kind === 'corp'` (manager) → exactly one row, the manager's own corp.

**Returns:** `{ id, name, allianceId }[]` with bigint columns stringified.

---

### loadCorpRightsMatrix(corporationId: bigint): Promise<CorpRightsMatrix>
Reads `ap_corporation_right` rows for the corp and returns a fixed-shape matrix: all six `map_right` enum values, each carrying either the row's `min_authz_level` or `null` when no row exists. The UI renders `null` as the "none" radio column without a second query.

**Returns:** `{ corporationId, rights: { right, minAuthzLevel }[] }` — always six entries in `rights`, indexed by `map_right` enum order.

---

### Types
- `AdminCorpRow` — `{ id, name, allianceId }`, bigints as strings.
- `CorpRightCell` — `{ right: MapRight; minAuthzLevel: AuthzLevel | null }`.
- `CorpRightsMatrix` — `{ corporationId: string; rights: CorpRightCell[] }`.

---

### Depends on
- `apCorporation`, `apCorporationRight`, `mapRight` — `@/db/schema`.
- `AdminVisibilityScope` — `@/lib/auth/rights`.
- `MapRight`, `AuthzLevel` — `@/types`.

### Notes
- `server-only` marker — the module is read-only DB access used by the admin server component, never imported from a client bundle.
- The "always six rows" shape mirrors how the matrix UI lays out radios, so the loader and the component never disagree about how many rights exist.
