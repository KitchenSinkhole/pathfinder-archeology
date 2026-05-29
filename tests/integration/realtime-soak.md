## realtime-soak.test.ts

**Purpose:** Multi-user sync soak — proves the realtime pathway keeps every client converged under concurrent map edits, and documents the two known robustness gaps (no transport drop is asserted; reconnect backfill is shown absent).
**File:** `tests/integration/realtime-soak.test.ts`

---

### What it exercises
The real commit→fan-out chain, end to end, against containerized Postgres:
`updateSystem` → `commitMapEvent` (one `ap_map_event`) → `tg_map_event_notify` (`pg_notify('map:<id>')`) → LISTEN bus → `attachWsServer` fan-out → `ws` client.

N **actors** fire concurrent position commits on **overlapping** systems (genuine same-row contention); K **observer** sockets record every `mapUpdate` in arrival order. Mutations go through the production mutation wrapper, not raw inserts, so eventId allocation and the trigger fire exactly as in the app. WS auth uses real Auth.js session cookies minted with `AUTH_SECRET`.

### Assertions
1. **Convergence** — each observer, folding received `system.updated` deltas in arrival order (last-write-wins), lands on the same final position per system as the authoritative `ap_map_system` row. Holds because pg NOTIFY delivers in commit order and the row's final value is set by the last committer.
2. **No transport drop** — each observer's received event-id set equals the committed `system.updated` id set for the burst window (server→socket fidelity under load).
3. **Reconnect gap** — an observer whose socket drops mid-burst receives NONE of the events committed while disconnected after it reconnects. This *documents* the missing "since eventId" backfill; flip the expectation to assert recovery once backfill lands.

### Scope / caveats
- Tests the **server→socket transport**. The separate client-layer risk — the React provider's single-slot `lastEvent` coalescing rapid bursts (`src/lib/realtime/useRealtime.tsx`) — sits above the socket and needs a jsdom provider-level test; raw `ws` does not coalesce.
- Mock characters are seeded `authz_level='admin'` so the soak measures sync, not authorization (admin overrides view/mutate in `src/lib/auth/rights.ts`).

### Running
DB-gated via `RUN_DB_TESTS=1` (needs Postgres + applied migrations):
```
docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test realtime-soak
```
Load is env-tunable: `SOAK_ACTORS` (4), `SOAK_OBSERVERS` (3), `SOAK_MOVES` (40), `SOAK_SYSTEMS` (6).

### Depends On
- `@/lib/realtime/wsServer` (`attachWsServer`), `@/lib/map/mutations/systems` (`updateSystem`), `@/lib/realtime/protocol` (`mapUpdateLoadSchema`).
- `@/db/client`, Drizzle schema (`apMap`, `apMapSystem`, `apCharacter`, `apUser`, universe geography), `next-auth/jwt` (`encode`), `ws`.
