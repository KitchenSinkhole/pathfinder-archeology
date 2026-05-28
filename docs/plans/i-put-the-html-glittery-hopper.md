# Fix the Signatures Panel

## Context

The Signatures panel (`src/components/sidebar/SignatureModule.tsx`) is wrong because the current model conflates three EVE-specific concepts. The fix has to land at the schema-usage level, not just the column layout.

**Domain facts (some surprising):**

- EVE cosmic-signature *groups* are seven: Combat, Relic, Data, Gas, Wormhole, Ore, Ghost. These exist as `universe_group` rows (resolvable at runtime by SDE name).
- EVE cosmic-signature *types* split into two universes:
  - **Wormhole sigs** have real SDE entries — `universe_wormhole.typeId` (= `universe_type.id`) for codes like K162, B274, A239.
  - **Combat / Relic / Data / Gas / Ore / Ghost sigs do NOT have `universe_type` rows.** Site names like "Fortification Frontier Stronghold", "Shattered Ice Field", "Forgotten Perimeter Habitation Coils", "Solar Cell" are baked into the EVE client; they are *not* exported in the SDE. Any attempt to resolve them against `universe_type` returns null — that's a domain constraint, not a data bug.
- The EVE in-game probe scanner emits a "Name" column that is **only meaningful at high scan strength**. At low strength, the Name cell is blank or repeats the Group label (e.g. "Wormhole"). Low-strength names should not be stored.

**Current bugs (all in the UI layer + paste resolver):**

1. **Every sig is rendered as a wormhole.** The "Type" column wires `WormholeTypeSelect` for every row. There is no Group concept exposed in the UI.
2. **The wrong freeform field is exposed.** The visible "Name" input is bound to `sig.name`, which is the EVE scanner snapshot — not a freeform notes field. The actual notes field, `sig.description`, isn't surfaced at all. Legacy shows only Description (via a pen-icon column).
3. **The paste resolver was misdirected.** `signatureReader.resolveSignatureRows` looks up `(groupName, name)` against `universe_type` for every row. That works only for Wormhole sigs (which match `universe_wormhole.name`). For Combat/Relic/Data/Gas/Ore/Ghost it silently returns null for `typeId` — exactly what we'd expect, because those types don't exist in `universe_type`.

**Schema decision (no migration needed):**

The existing `ap_map_signature` columns are *re-interpreted* — no schema change:

| Column            | Meaning after fix                                                                                                |
|-------------------|------------------------------------------------------------------------------------------------------------------|
| `groupId`         | FK to `universe_group.id` for one of the seven cosmic groups. Null = "unknown".                                  |
| `typeId`          | FK to `universe_type.id`, **meaningful only when `groupId` is the Wormhole group** (points to `universe_wormhole`). Always null otherwise. |
| `name`            | For Wormhole sigs: redundant display string ("K162", "B274"); kept in sync with the resolved WH name. For cosmic sites: **the user-typed site name string** (e.g. "Fortification Frontier Stronghold"). Null when unknown or scan strength too low. |
| `description`     | Freeform user notes (the legacy pen-icon column).                                                                |
| `mapConnectionId` | Only set when the sig is a Wormhole that's been linked to a connection on the map.                               |

`name` doubles as "the Type display string for cosmic sites" and "an editable text field" for those groups. For Wormhole sigs, the user picks via dropdown (sets `typeId`); the display string comes from the SDE join.

**Intended UI (matches legacy `docs/spec/example-signatures-table.html`):**

| Sig ID  | Group     | Type                                  | Description | Leads to             | TTL  |
|---------|-----------|---------------------------------------|-------------|----------------------|------|
| BIF-460 | Relic     | Forgotten Perimeter Habitation Coils  | (pen)       | (n/a)                | …    |
| BNH-745 | Wormhole  | B274 → H                              | (pen)       | Liekuri (hsStatic)   | …    |
| SCV-086 | Data      | Central Guristas Sparking Transmitter | (pen)       | (n/a)                | …    |
| UTN-908 | unknown   | (disabled — pick a group first)       | (pen)       | (n/a)                | …    |

Input flow: sig ID → group → type (dropdown if Wormhole, text input otherwise) → connection (only for Wormhole).

---

## Recommended Approach

### UI column layout

`SignatureModule` table and the draft-input row both render six columns:

1. **Sig** — `Input`, uppercase, max 7 chars. Displays full code (e.g. `BIF-460`).
2. **Group** — new `SignatureGroupSelect`. Fixed dropdown of seven cosmic groups + "unknown" (null). Changing group **clears `typeId` and `name`**, and clears `mapConnectionId` when leaving Wormhole.
3. **Type** — cascades on Group:
   - `group == Wormhole` → existing `WormholeTypeSelect`. Writes `typeId`. The dropdown's selected label is also mirrored to `sig.name` in the same patch for consistency.
   - `group ∈ {Combat, Relic, Data, Gas, Ore, Ghost}` → a free-form `Input` bound to `sig.name`. Patches `name` on blur/debounce. **No `CosmicSiteTypeSelect` — `universe_type` has no rows to populate it.** (Future: replace with a class-filtered dropdown once a curated mapping is gathered. Leave a `// TODO(class-filter)` marker.)
   - `group == null` → disabled placeholder ("Pick a group first").
4. **Description** — `Input`, bound to `sig.description`. Patches `description` on blur/debounce.
5. **Leads to** — new `ConnectionSelect`. Only enabled when `group == Wormhole`. Lists every connection touching the current system; each option shows the other end's `alias ?? name` + class label (e.g. `Liekuri (hs)`, `J231245 (c3)`). Derived from `MapViewData.connections` + `MapViewData.systems` — no API call. Writes `mapConnectionId`.
6. **TTL** — unchanged (`formatRelativeIso(sig.expiresAt)`).
7. **Delete** — unchanged.

**Type-cell display priority:**
- Wormhole sigs: `universe_wormhole.name` (via the existing display join) → "—" if unresolved.
- Cosmic sigs: `sig.name` → "—" if null/blank.

### Server-side changes

#### `src/lib/map/loadMap.ts`

Currently selects raw `groupId` / `typeId` only. Extend with two LEFT JOINs to surface display strings:

- `.leftJoin(universeGroup, eq(apMapSignature.groupId, universeGroup.id))` → `groupName`
- `.leftJoin(universeWormhole, eq(apMapSignature.typeId, universeWormhole.typeId))` → `wormholeCode`

Emit `groupName: string | null` and `wormholeCode: string | null` on each `MapSignature`. No `universe_type` join needed — non-wormhole types aren't there.

Also embed the resolved seven-group catalog: `signatureGroups: SignatureGroupOption[]` on `MapViewData` (one DB hit per page-load via `getSignatureGroups()`). This lets the client render the Group dropdown without hardcoding IDs that depend on SDE bootstrap state.

#### `src/types/index.ts`

```ts
export type MapSignature = {
  id: string;
  mapSystemId: string;
  mapConnectionId: string | null;
  sigId: string;
  groupId: number | null;
  groupName: string | null;        // new — display only, server-resolved
  typeId: number | null;           // wormhole-only
  wormholeCode: string | null;     // new — display only, server-resolved (e.g. "B274")
  name: string | null;             // cosmic-site name string (user-editable for non-wormhole groups)
  description: string | null;
  expiresAt: string;
};

export type SignatureGroupKey =
  | 'combat' | 'relic' | 'data' | 'gas' | 'wormhole' | 'ore' | 'ghost';

export type SignatureGroupOption = {
  key: SignatureGroupKey;
  groupId: number;
  label: string;     // 'Combat', 'Relic', …
  sdeName: string;   // 'Combat Site', 'Relic Site', …
};
```

`MapViewData` gets `signatureGroups: SignatureGroupOption[]`.

#### `src/lib/map/signatureGroups.ts` (NEW, server-only)

- `SIGNATURE_GROUP_CATALOG`: hardcoded `[{ key, label, sdeName }]` for the seven groups. SDE names per `signatureReader.ts` convention: `'Combat Site'`, `'Relic Site'`, `'Data Site'`, `'Gas Site'`, `'Wormhole'`, `'Ore Site'`, `'Ghost Site'`. (Verify by querying actual `universe_group.name` content during implementation; correct any that differ.)
- `getSignatureGroups(): Promise<SignatureGroupOption[]>` — resolves `groupId` for each entry from `universe_group` (filter by `sdeName` via `inArray`), cached in a module-level `Promise`. Logs a warning for any miss.

No `signatureTypesForGroup` and no `/api/map/[mapId]/signature-types` route — cosmic site types aren't in the SDE, so there's nothing to fetch.

#### Paste resolver — `src/lib/map/signatureReader.ts`

Rework `resolveSignatureRows`:

1. Look up group name → `groupId` (unchanged).
2. For each row, if `groupName` equals the Wormhole group's SDE name AND `name` matches a `universe_wormhole.name` → set `typeId`. Otherwise leave `typeId` null.
3. **For non-wormhole groups, do not query `universe_type`.** Just carry the parsed `name` through (the cosmic site name string the EVE scanner emitted).
4. **Drop low-strength names.** If `name` is blank, or `name` equals the group label (e.g. EVE says "Wormhole" for both group and name on an un-warped wormhole), null it out.

#### `src/lib/map/mutations/signatures.ts`

No changes — the create / update / delete helpers already accept `groupId`, `typeId`, `mapConnectionId`, `name`, `description`. The reinterpretation lives entirely in *who writes what*.

#### Cascade on Group change

When the user changes Group on an existing sig, the patch must also null the dependent fields:
- Always: `typeId = null`, `name = null`.
- When leaving Wormhole (i.e. previous group was Wormhole, new group is not): `mapConnectionId = null`.

Implement this in the `SignatureModule` `onPatch` wrapper, not on the server. One PATCH request carrying the combined keys.

### Client components

#### `src/components/sidebar/SignatureGroupSelect.tsx` (NEW)

Props: `groups: SignatureGroupOption[]`, `value: number | null`, `onValueChange: (next: { groupId: number | null; groupName: string | null }) => void`, `disabled?: boolean`. Pure-client dropdown with the seven labels + "unknown".

#### `src/components/sidebar/ConnectionSelect.tsx` (NEW)

Props: `system: MapSystemNode`, `connections: MapConnectionEdge[]`, `systems: MapSystemNode[]`, `value: string | null`, `onValueChange: (next: string | null) => void`, `disabled?: boolean`. Filters `connections` to those touching `system.id`; option label = other end's `alias ?? name` + class. No API call.

#### `src/components/sidebar/SignatureModule.tsx` (refactor)

- Add `signatureGroups`, `connections`, `systems` props (threaded from `MapCanvas` via `MapViewData`).
- New six-column layout per the table above.
- Group → type cascade rules in the row-level patch builder.
- Draft-input row mirrors the same six fields.
- "Paste from scanner" button and `SignaturePasteDialog` are untouched at the call-site, but the dialog's preview rendering needs adjustment (see below).

#### `src/components/dialogs/SignaturePasteDialog.tsx`

Preview table currently shows status icons keyed on `typeId` resolution. Update to:
- For wormhole rows: status keyed on `typeId`.
- For cosmic-site rows: status keyed on `name` (presence vs. null after low-strength filtering).
- "Unresolved" only flags rows whose `groupId` itself didn't resolve.

### Companion `.md` files

Per the standing instruction (`CLAUDE.md` "Companion `.md` files"), every new/modified `.ts`/`.tsx` gets its companion updated in the same edit.

**New companions:** `SignatureGroupSelect.md`, `ConnectionSelect.md`, `signatureGroups.md`.

**Updated companions:** `SignatureModule.md`, `loadMap.md`, `signatureReader.md`, `SignaturePasteDialog.md`, `types/index.md`, `MapCanvas.md` (new props).

---

## Files touched (summary)

**New:**
- `src/components/sidebar/SignatureGroupSelect.tsx` (+ `.md`)
- `src/components/sidebar/ConnectionSelect.tsx` (+ `.md`)
- `src/lib/map/signatureGroups.ts` (+ `.md`)

**Modified:**
- `src/components/sidebar/SignatureModule.tsx` (+ `.md`) — column overhaul, cascade rules
- `src/components/dialogs/SignaturePasteDialog.tsx` (+ `.md`) — preview rendering for the new resolver semantics
- `src/lib/map/loadMap.ts` (+ `.md`) — joins for `groupName`/`wormholeCode`, embed `signatureGroups`
- `src/lib/map/signatureReader.ts` (+ `.md`) — wormhole-only `typeId` lookup, drop universe_type, drop low-strength names
- `src/lib/map/applyEvent.ts` (+ `.md`) — pass-through of new display fields in optimistic events
- `src/types/index.ts` (+ `.md`) — `MapSignature` extension, new option types, `MapViewData.signatureGroups`
- `src/components/map/MapCanvas.tsx` (+ `.md`) — thread `signatureGroups`, `connections`, `systems` into `SignatureModule`

Reused as-is: `wormholeTypesForSystem`, `WormholeTypeSelect`, `createSignature`/`updateSignature`/`deleteSignature`, `/api/map/[mapId]/signatures*` routes.

---

## Verification

### Manual end-to-end (golden path)

`pnpm dev`; open a map with at least one C3 system you control; select it.

1. Add a sig: type `ABC-123`, leave Group as "unknown", click Add. Row appears with disabled Type and Leads-to cells.
2. Set Group → Relic. The Type cell becomes a text input. Type "Forgotten Perimeter Habitation Coils". Leads-to stays disabled.
3. Edit Description; reload — all four edits persist.
4. Add `WHT-001`; set Group → Wormhole. Type cell becomes the wormhole dropdown (class-appropriate codes + K162). Pick `B274`. Leads-to becomes enabled.
5. Open Leads-to → lists every connection touching the current system. Pick one. Reload — persisted.
6. On `WHT-001`, change Group → Data: confirm Type clears, Leads-to disables, DB row shows `typeId: NULL`, `mapConnectionId: NULL`, `name: NULL`.
7. Open in a second tab — both windows show the same edits within ~1s (realtime fanout).
8. Open "Paste from scanner", paste a real high-strength scanner export covering at least one of each group. Apply.
   - Wormhole rows with a recognised code → `typeId` populated; display shows code (e.g. `B274`).
   - Wormhole rows with EVE Name = "Wormhole" (low strength) → `typeId` null, `name` null (low-strength filter kicked in).
   - Cosmic-site rows → `name` populated with the EVE site name string; `typeId` null.

### Edge cases

- Pick non-Wormhole group then switch to Wormhole → Type swaps to dropdown, Leads-to enables, `name` clears.
- Delete a sig → row vanishes from both tabs.
- Empty Description with whitespace → patches `description = null`.

### Automated

- Extend `tests/integration/map-signature-paste.test.ts`:
  - Wormhole row with WH code in Name → `typeId` populated, `name` = WH code.
  - Wormhole row with Name = "Wormhole" → both `typeId` and `name` null.
  - Cosmic-site row → `name` populated, `typeId` null.
- Unit-test the Group-change cascade: patching `groupId` from Wormhole → null produces an outgoing patch that also nulls `typeId`, `name`, and `mapConnectionId`.
- `pnpm test` and `pnpm tsc --noEmit` must pass.
