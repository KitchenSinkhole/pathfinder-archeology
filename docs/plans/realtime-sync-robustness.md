# Realtime Sync Robustness

**Goal:** Close the two dropped-event gaps in the map realtime pathway so a client never silently diverges — (1) bursts can't be coalesced away on the client, and (2) a reconnecting client recovers what it missed while disconnected.

**Spec / context references:**
- CLAUDE.md §"Realtime" (broadcast-only WS, degraded banner must never render silently stale).
- `docs/spec/SPEC.md` §§5–6 (realtime pipeline), §71 NFR (degraded mode).
- Soak harness + companion: `tests/integration/realtime-soak.test.ts`, `tests/integration/realtime-soak.md`.

---

## Background — what was found (investigation, already done)

The commit→fanout chain is sound and convergent under concurrency:
`updateSystem` → `commitMapEvent` (one `ap_map_event`) → `tg_map_event_notify` (`pg_notify`) → LISTEN bus (single connection, **commit-ordered**) → WS fan-out. The delta payload model means a move is `{ id, positionX, positionY }`, never a full-map push, so concurrent edits can't clobber via stale snapshots. The soak proves convergence + zero transport drop even at 960 contended commits.

Two gaps remain, both about **dropped-event recovery**, both above the socket:

1. **Client-layer burst coalescing.** `RealtimeProvider` stores the most recent envelope in a single `useState` (`src/lib/realtime/useRealtime.tsx:45,79`); `MapCanvas` reacts via `useEffect([lastEvent])` (`src/components/map/MapCanvas.tsx:105-116`). If two envelopes land before React commits the render, only the last value survives the state slot — the intermediate event is dropped *client-side* even though the socket delivered it. Raw-`ws` transport does not coalesce, so the soak can't catch this; it needs its own test.

2. **No reconnect backfill.** On a dropped socket the SharedWorker reconnects and *replays the subscription set* (`src/lib/realtime/sharedWorker.ts:69-74`) — it resumes **new** events only. Anything committed during the disconnect window is lost permanently; the banner warns but the canvas is never re-synced. `eventId` is a monotonic sequence (the ingredient for a fix) but is used today only for self-echo dedup.

The two stages are independent and should be run in separate sessions.

---

## Stage 1 — Client event delivery becomes a queue (closes gap #1)

**Mode:** Accept edits
**Goal:** Every envelope the worker delivers reaches the consumer exactly once, regardless of React render batching. Replace the single-slot `lastEvent` with a synchronous listener fan-out.
**Touches:** `src/lib/realtime/useRealtime.tsx` (+ `.md`), `src/components/map/MapCanvas.tsx` (+ `.md`), `src/lib/realtime/MapPresenceContext.tsx` if it also reads `lastEvent`, new `tests/unit/realtime-delivery.test.tsx` (+ `.md`).

**Approach (already agreed — mechanical):**
- In `RealtimeProvider`, keep a `useRef<Set<(e: Envelope) => void>>` of listeners. On each `port.onmessage` message envelope, call **every** listener synchronously (not via state). `status` stays `useState` (drives the banner); `lastEvent` state is removed (or kept only as a debug convenience — prefer removing it to avoid two delivery paths).
- Add a hook `useRealtimeEvents(handler: (e: Envelope) => void): void` that registers/unregisters the handler in a `useEffect`. The handler must be wrapped by the caller in a stable ref or the hook must store the latest handler in a ref so re-registration isn't needed every render.
- In `MapCanvas`, replace the `useEffect([lastEvent])` block with `useRealtimeEvents(onEnvelope)` where `onEnvelope` does exactly what the current effect does: ignore non-`mapUpdate`, `safeParse` the load, dedup via `appliedEventIds`, fold through `applyEvent`. Self-echo dedup is unchanged.
- Audit every other reader of `useRealtime().lastEvent` (grep) and migrate them to `useRealtimeEvents`. The presence provider folds `characterUpdate` envelopes — migrate it too if it reads `lastEvent`.

**Test (the assertion the gap currently fails):**
- jsdom: stub `globalThis.SharedWorker` with a fake exposing the port; render `RealtimeProvider` wrapping a probe component that registers `useRealtimeEvents(push → received[])`. Fire N `message` events on the port **within a single tick** (no `await` between them). Assert `received.length === N` and order preserved. The old single-slot implementation drops to `1`; the queue implementation passes.

**Done when:** the new delivery test passes, `pnpm typecheck` + `pnpm lint` are clean, and `RUN_DB_TESTS=1 pnpm test realtime-soak` still green (no regression to the transport path).

---

## Stage 2 — Reconnect resync (closes gap #2)

**Mode:** Plan mode
**Goal:** When a client's socket reconnects after having been disconnected, the canvas converges to the authoritative DB state instead of silently missing the gap.
**Touches (depends on the decision below):** `src/lib/realtime/useRealtime.tsx`, `src/components/map/MapCanvas.tsx`, possibly `src/lib/realtime/sharedWorker.ts`, possibly a new `src/app/api/map/[mapId]/snapshot/route.ts` **or** `.../events/route.ts`, `src/lib/map/loadMap.ts`, `src/types/index.ts`, tests. All with companion `.md` updates.

**Key decision to settle first (this is why the stage is Plan mode):**

| Approach | Mechanism | Trade-off |
|---|---|---|
| **A. Snapshot refetch on reconnect (recommended)** | On reconnect, refetch the full `MapViewData` and reset `viewData` + the dedup set. New `GET /api/map/[mapId]/snapshot` returning `loadMapForView` JSON (or `router.refresh()` + reset `viewData` from the new `data` prop). | Guaranteed correct (DB row is truth); simplest; no ordering hazard. One extra fetch per reconnect — and reconnects are rare. |
| **B. Backfill "since eventId"** | Track a per-map high-watermark `lastEventId` (seed from a new `MapViewData.lastEventId` at page load; advance on every applied event). On reconnect, `GET /api/map/[mapId]/events?since=N` returns payloads with `id > N` ascending; fold each through `applyEvent` (dedup via `appliedEventIds`); on a gap larger than a cap (e.g. 1000) return `{ truncated: true }` and fall back to a full reload. | Preserves the activity feed and avoids a full snapshot, but `ap_map_event.id` order ≠ commit order, so replaying contended same-row edits in id order can land a different last-writer than the DB. Needs the truncation fallback anyway. More moving parts. |

Recommendation: **A**. It's smaller, has no LWW-ordering hazard, and reconnects are infrequent. Reserve B only if an explicit need to avoid full refetch surfaces.

**Reconnect trigger (both approaches):** detect the `status` transition into `'open'` from a previously non-open state. `status` already lives in `RealtimeProvider`; in `MapCanvas`, `useEffect` on `status` with a `wasDisconnectedRef` so the **initial** mount-open does NOT trigger a resync (the page-load snapshot is already fresh) — only an open that follows a `closed`/`degraded` does. No new worker→port plumbing is required if `status` is reused; only add a worker signal if Plan-mode review finds `status` insufficient.

**Backend (approach A):** `GET /api/map/[mapId]/snapshot` — `requireMapView(rawMapId, session)` guard (mirror `src/app/api/map/[mapId]/wormhole-types/route.ts`), return `{ ok: true, data: <MapViewData> }` from `loadMapForView`. Existence is never leaked: missing/non-viewable → 404.

**Tests:**
- Client (jsdom, mock `SharedWorker` + mock `fetch`): drive `status` `open → degraded → open`; assert a snapshot fetch fires only on the *second* open and that `viewData` is reset from the response. Assert the initial open does **not** fetch.
- Flip the soak's intent at the **real-client** layer, not the raw-`ws` observer: the soak's reconnect test (`tests/integration/realtime-soak.test.ts`, test #3) stays as-is — it documents the *transport* has no backfill, which remains true. Add a note in `realtime-soak.md` pointing to the new client-level reconnect test as the place that proves end-to-end recovery.

**Done when:** the client reconnect test passes (resync on reconnect, no fetch on first open), `pnpm typecheck`/`pnpm lint` clean, and the soak suite still green. The degraded banner behaviour (Stage 1 unaffected) still shows during the disconnect and clears on recovery.

---

## Notes for whoever runs this

- Start each stage in a fresh session; open this file and read the stage first.
- Stage 1 is mechanical → Accept edits. Stage 2 has a real design fork (A vs B) → Plan mode; confirm the approach before writing files.
- Standing instruction applies: every `.ts`/`.tsx` you touch gets its companion `.md` updated in the same change.
- The soak harness is the regression guard for the transport layer; the two new tests guard the client layer. Run `RUN_DB_TESTS=1 pnpm test realtime-soak` (Postgres up via `docker compose`) after each stage.
