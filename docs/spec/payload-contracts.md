# Payload Contracts — WebSocket vocabulary & ESI opKey map

**Stage 3 (Phase 0) deliverable.** Closes SPEC [§11](SPEC.md) Q3 (WebSocket payload shapes) and Q6 (opKey ↔ swagger op mapping). These two contracts must exist before any realtime transport (Stage 8) or TypeScript ESI client (Stage 4) is written.

The runnable source of truth lives in code:
- WS contracts: [`src/lib/realtime/protocol.ts`](../../src/lib/realtime/protocol.ts) (Zod).
- ESI opKey map: [`src/lib/esi/opkeys.ts`](../../src/lib/esi/opkeys.ts), enforced by [`tests/esi/opkeys.test.ts`](../../tests/esi/opkeys.test.ts).

This document is the human-readable companion; if it ever disagrees with the code, the code wins.

---

## Design stance

Payload shapes are derived from the **rebuild's operational need and architecture**, not from mimicking the legacy `KitchenSinkhole/pathfinder_websocket` server. The task *vocabulary* (names) is fixed by CLAUDE.md and carried forward; the legacy *shapes* (e.g. the 32-char access-token socket handshake, the TCP-daemon `stats` object) are not. Future stages should not "restore parity" on these shapes.

Architecture recap (SPEC §§5–6, CLAUDE.md):
- The WebSocket is **broadcast-only**. Clients never mutate over it.
- Every mutation lands as exactly one `INSERT INTO ap_map_event`; an AFTER INSERT trigger fires `pg_notify('map:'||map_id, …)`; the WS server's Postgres `LISTEN` handler fans the envelope to subscribed sockets.
- Authorization is session-based (Auth.js). `subscribe` only names the map channels the client wants; the server independently verifies the session has access. No token travels on the wire.

---

## WebSocket contracts

### Envelope

Every frame is `{ task, load }` (NDJSON/JSON). `envelopeSchema` keeps `load` as `unknown`; the per-task discriminated unions validate the body, so a malformed frame fails at the task layer with context.

### Direction & task vocabulary

| Task | Direction | Load (firm fields) | Triggered when |
|---|---|---|---|
| `subscribe` | client → server | `{ mapIds: number[] }` | Client wants events for these maps (must already be session-authorized). |
| `unsubscribe` | client → server | `{ mapIds: number[] }` | Client drops these map channels (e.g. last tab for the map closes). |
| `healthCheck` | both | `{ ts, ok?, listeners? }` | Liveness probe; client sends `ts`, server echoes with status. |
| `mapUpdate` | server → client | `{ mapId, eventId?, kind?, data? }` | After any map-affecting mutation (one per `ap_map_event` insert). |
| `mapAccess` | server → client | `{ mapId, characterIds: number[] }` | Map access grants change (share with corp/alliance/character). |
| `mapConnectionAccess` | server → client | `{ mapId, data? }` | A connection's visibility for a subset of characters changes. |
| `mapDeleted` | server → client | `{ mapId }` | A map is (soft-)deleted. |
| `characterUpdate` | server → client | `{ characterId, data? }` | Character status/location changes (other tabs of the same character update). |
| `characterLogout` | server → client | `{ characterIds: number[] }` | On logout/session expiry — evict subscriptions, notify remaining users. |
| `logData` | server → client | `{ mapId, data? }` | A map-history event (the `ap_map_event` history record) is appended. |

### Firm vs forward-declared

**Firm now** (control plane + access fanout): `subscribe`, `unsubscribe`, `healthCheck`, `mapDeleted`, `characterLogout`, `mapAccess`.

**Forward-declared now, tightened in Stage 6** (data bodies): `mapUpdate`, `mapConnectionAccess`, `characterUpdate`, `logData`. Their event-reference fields (`mapId`, `eventId`, `characterId`) are firm; the `data` body is a `z.unknown()` passthrough because the `ap_map_system` / `ap_map_connection` / `ap_map_event` row schemas don't exist until Stage 6. Each carries a `// tightened in Stage 6` marker in the code.

---

## ESI opKey → operationId map

`OP_KEYS` in [`opkeys.ts`](../../src/lib/esi/opkeys.ts) is the canonical map. An **opKey** is Pathfinder's internal operation name; it resolves to a swagger `operationId`, and [`docs/ESI/swagger.json`](../ESI/swagger.json) is authoritative for the resulting HTTP method/path/params. The full inventory (≈40 opKeys, grouped: status, character, corporation/alliance, UI mutations, routing/search, universe geography, universe items/dogma, structures, stats/sovereignty) is enumerated in code; the per-call argument/response detail remains in [05-external-integrations.md §3.1](05-external-integrations.md).

Each `OpDef` carries `operationId`, `auth` (`'none' | 'character'`), and an optional `inferred: true`.

**Inferred pairings** (docs/spec/05 Q1 — vendor package not vendored, so the option-bag request shape is unconfirmed and must be re-checked in Stage 4): `setWaypoint`, `openWindow`, `getRoute`.

**Note:** `getCharacterRoles` and `getCorporationRoles` both resolve to `get_characters_character_id_roles` (corp roles are a subset of that response) — intentional.

### Enforcement

`tests/esi/opkeys.test.ts` parses every `operationId` out of `swagger.json` and asserts each `OP_KEYS` entry resolves to one that exists. A typo or ESI schema drift fails the test rather than surfacing at runtime. This is the concrete "diff against swagger" that Q6 requires.
