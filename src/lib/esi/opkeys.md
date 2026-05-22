## opkeys.ts

**Purpose:** Canonical opKey → swagger `operationId` map the Stage 4 ESI client dispatches against. Data only, no request logic.
**File:** `src/lib/esi/opkeys.ts`

opKey = Pathfinder's internal operation name (e.g. `getCharacterLocation`). It resolves to a swagger `operationId`, and `docs/ESI/swagger.json` is authoritative for the resulting HTTP method/path/params. Inventory grepped from legacy call sites (docs/spec/05 §3.1).

---

### `OP_KEYS`
`as const satisfies Record<string, OpDef>` — 40 opKeys. Each value is an `OpDef`:
- `operationId: string` — swagger op (verified to exist by `tests/esi/opkeys.test.ts`).
- `auth: 'none' | 'character'` — whether a character ESI token is required.
- `inferred?: true` — pairing not confirmed against vendor source; re-confirm option-bag request shape in Stage 4.

**Inferred entries** (docs/spec/05 Q1, option-bag args): `setWaypoint` (`post_ui_autopilot_waypoint`), `openWindow` (`post_ui_openwindow_information`), `getRoute` (`get_route_origin_destination`).

**Note:** `getCharacterRoles` and `getCorporationRoles` both map to `get_characters_character_id_roles` (corp roles are a subset of that response) — intentional, not a duplicate bug.

### `OpDef`
Interface for a single opKey definition (see fields above).

### `OpKey`
`keyof typeof OP_KEYS` — string-literal union of all opKey names. Re-exported from `src/types/index.ts`.
