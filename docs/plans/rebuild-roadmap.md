# Aperture Rebuild — Full Roadmap

## Context

Aperture is the Next.js + TypeScript + Drizzle + Postgres rebuild of the legacy Pathfinder app. The behavior-level spec is complete (docs/spec/00–10), and [docs/spec/SPEC.md](docs/spec/SPEC.md) is the assembly document that translates the legacy behavior into a forward-looking architecture (§§5–7), a Keep/Drop/Redesign matrix (§8), and a phased migration plan (§9, six phases).

The repo currently contains only specs and CLAUDE.md — no code. Before any feature work begins, we need a single roadmap that names every stage from green-field scaffold through production cutover, so each stage can later get its own session-sized plan per CLAUDE.md's planning protocol.

**This roadmap intentionally stays at one-level-above-execution detail.** Each stage will be expanded into its own multi-stage plan in `docs/plans/<feature-name>.md` when its turn comes. The current goal is the skeleton, not the muscle.

Stage groupings follow SPEC §9's six phases. Each stage ends at a natural checkpoint (passing test, green build, or feature-flagged path) so progress is visible without waiting for a whole phase to land.

---

## Phase 0 — Foundations

Infrastructure and the §11 Phase-0 deliverables that constrain every later phase. No user-visible features land in this phase.

### Stage 0 — Project scaffold
**Goal:** A clean Next.js 16 + React 19 + TS 6 repo with Drizzle, Auth.js v5, shadcn/ui, sonner, Tiptap, xyflow, TanStack Table installed; `docker compose` brings up Postgres 18 with `pgcrypto` and `pg_partman`; `pnpm dev` boots an empty App Router page; `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest) all pass; CI runs the same.
**Touches:** `package.json`, `next.config.ts`, `tsconfig.json`, `docker-compose.yml`, `aperture.config.ts`, `.env.example`, `src/app/layout.tsx`, `.github/workflows/ci.yml`.
**Done when:** Empty app runs locally and in CI against a containerized Postgres.

### Stage 1 — Universe schema & SDE ingest
**Goal:** All `universe_*` tables from SPEC §6 modeled in Drizzle (systems, constellations, regions, groups, types, type-attributes, stargate edges, type overrides, per-system WH statics, the wormhole-type routing catalog `universe_wormhole`). One-shot SDE ingest CLI populates them from CCP's official SDE; vendored community CSVs (anoik.is) seed the WH statics and the wormhole-type catalog; a route-lookup smoke test matches the legacy `eve_universe` row counts within 0.5%.
**Touches:** `src/db/schema/universe/*.ts`, `src/db/migrations/`, `src/lib/sde/ingest.ts`, `scripts/sde-bootstrap.ts`, `scripts/data/{system-static,wormhole-classes,wormhole-overrides}.csv`.
**Done when:** SPEC §9 Phase 0 gate is green — universe row counts within 0.5% of legacy; 100-system spot-check passes.

### Stage 2 — Auth.js EVE SSO + refresh-token rotation
**Goal:** Auth.js v5 with a custom EVE SSO provider performing authorize → callback → token-exchange → JWK-verify. `ap_character` table holds encrypted `esi_access_token` / `esi_refresh_token` / `esi_scopes`. Refresh-token rotation persists the new refresh token *before* the new access token is consumed, with an integration test proving it. JWK cache implemented with the one-fetch-per-10s cap.
**Touches:** `src/db/schema/pf/character.ts`, `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/auth/eve-provider.ts`, `src/lib/crypto.ts`, `tests/integration/auth-rotation.test.ts`.
**Done when:** A test character can log in, the rotated refresh token is verifiably written to DB before any caller sees the new access token, and the JWK cache cap is enforced. Closes SPEC §11 Q4.

### Stage 3 — WebSocket payload contracts & ESI opKey mapping
**Goal:** The two §11 Phase-0 deliverables that must precede any TS ESI client or realtime code. Define Zod schemas for the full WebSocket task vocabulary (`mapUpdate`, `mapAccess`, `mapConnectionAccess`, `mapDeleted`, `characterUpdate`, `characterLogout`, `healthCheck`, `logData`, `subscribe`, `unsubscribe`). Diff legacy `KitchenSinkhole/pathfinder_esi` opKeys against the swagger op surface and publish the canonical opKey → swagger op map.
**Touches:** `src/lib/realtime/protocol.ts`, `src/lib/esi/opkeys.ts`, `docs/spec/payload-contracts.md`.
**Done when:** Both artifacts are committed and reviewed. Closes SPEC §11 Q3 & Q6.

### Stage 4 — ESI client
**Goal:** TS ESI client using the Stage 3 opKey map; every response decoded by Zod; per-endpoint circuit breakers; CCP downtime window (`±8m` around `CCP_SSO_DOWNTIME`) handled as expected; rate-limit aware. No business logic yet — this is the substrate for Stages 7, 10, 12, 13.
**Touches:** `src/lib/esi/client.ts`, `src/lib/esi/decoders/*.ts`, `src/lib/esi/breaker.ts`.
**Done when:** Integration tests against ESI sandbox demonstrate decoding, breaker open/close, and downtime tolerance.

---

## Phase 1 — Auth + read-only map

### Stage 5 — App shell, login, multi-character session
**Goal:** App Router root layout with page chrome (header, footer, splash). Public landing + login route. Logged-in user lands on a maps list. Multi-character switch implemented as a Server Action that updates the Auth.js session. shadcn `Sheet` replaces legacy Slidebars.
**Touches:** `src/app/(public)/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/maps/page.tsx`, `src/components/chrome/*`, `src/lib/session.ts`.
**Done when:** A logged-in character can switch characters and see their (legacy-replicated) map list.

### Stage 6 — Per-map schema
**Goal:** Drizzle models for `ap_map`, `ap_map_system`, `ap_map_connection`, `ap_map_signature`, `ap_map_event` (partitioned monthly via `pg_partman`), `ap_event_kind`, plus the AFTER INSERT trigger on `ap_map_event` that does `pg_notify('map:'||map_id, …)`. All enums declared (`map_scope`, `map_type`, `system_status`, `connection_scope`, `wh_mass`, `wh_jump_mass`, `character_status`, `authz_level`). Migrations are reversible and tested.
**Touches:** `src/db/schema/pf/*.ts`, `src/db/migrations/`, `tests/db/triggers.test.ts`.
**Done when:** Schema migrations apply and rollback cleanly; trigger fires `pg_notify` on every insert (verified by a `LISTEN` test).

### Stage 7 — Read-only map view (xyflow)
**Goal:** Map page renders ap_map_system + ap_map_connection on xyflow with the legacy visual fidelity (status colors, EOL/mass styling, alias/tag overlays). Route module and kill-stats sidebar populated read-only from `universe_*` + `ap_system_stats`. No edit affordances anywhere.
**Touches:** `src/app/(app)/map/[[...slug]]/page.tsx`, `src/components/map/MapCanvas.tsx`, `src/components/map/SystemNode.tsx`, `src/components/map/ConnectionEdge.tsx`, `src/components/sidebar/RouteModule.tsx`, `src/components/sidebar/KillStatsModule.tsx`.
**Done when:** SPEC §9 Phase 1 gate is green — a logged-in character sees their maps with all systems, connections, kill stats and route module populated; no edit UI present.

---

## Phase 2 — Map writes + realtime

### Stage 8 — Realtime transport (WS + SharedWorker)
**Goal:** Node-runtime WebSocket route in the Next.js deployment. Postgres LISTEN handler on the channels emitted by the Stage 6 trigger. SharedWorker on the client multiplexes a single socket across tabs for one character. UI surfaces a degraded-mode banner if the socket is unhealthy — never silently stale.
**Touches:** `src/lib/realtime/wsServer.ts`, `src/lib/realtime/bus.ts`, `src/lib/realtime/sharedWorker.ts`, `src/components/RealtimeStatusBanner.tsx`.
**Done when:** Two tabs subscribed to the same map see each other's `pg_notify` messages within <500ms; killing the socket flips the banner.

### Stage 9 — Map mutation pathways (CRUD)
**Goal:** Server Actions for low-traffic mutations (map create/delete, account settings) and JSON API routes for high-frequency ones (signature edits, system drag, connection type cycle, mass/EOL/frigate/preserve-mass flags, rally toggle, intel notes, tags, alias). Every mutation lands as exactly one `INSERT INTO ap_map_event`. WebSocket is broadcast-only — clients never mutate over WS.
**Touches:** `src/app/api/map/**`, `src/app/(app)/actions/*`, `src/lib/map/mutations/*`.
**Done when:** All map/system/connection/signature CRUD works end-to-end through the canonical pathway; mutations replicate to other tabs via realtime.

**Wormhole-data wiring:** the signature→WH-type edit path filters the type dropdown by the active system's class via `universe_wormhole.source_class` (+ universal `K162`); "mark connection as static" matches the connection's target class against `universe_system_static` + `universe_wormhole` (SPEC §6.4).

**Stage 9 follow-up — Quick-toggle context menus (deferred):** Stage 9.6 placed all field edits in the sidebar inspector with double-click inline edits for system alias / tag only. The legacy Pathfinder UX additionally supported right-click context menus on the system and connection tiles for one-click toggles (status cycle, lock, EOL flip, mass cycle, rolling, frigate, preserve-mass). Port that surface after Stage 10 lands, reusing the existing `client.ts` wrappers — no new server work required.

### Stage 10 — Paste readers & connection lifecycle
**Goal:** D-Scan paste, signature paste reader (with versioned history rendered from `ap_map_event`), connection type cycling and mass/EOL state machine, "is rolling" toggle, auto-expiry rules. Signature reap timing (`expires_at`) wired in.
**Touches:** `src/components/dialogs/SignaturePaste.tsx`, `src/components/dialogs/DScanPaste.tsx`, `src/lib/map/signatureReader.ts`, `src/lib/map/connectionState.ts`. The signature paste reader resolves WH codes against `universe_wormhole`/`universe_type` for class metadata.
**Done when:** SPEC §9 Phase 2 gate is green — §§ 2–6 of the feature matrix work end-to-end; a pilot corp can run a real chain ops session.

---

## Phase 3 — Background jobs + external integrations

### Stage 11 — graphile-worker runtime + standard jobs
**Goal:** Single Node job runner backed by `graphile-worker` and Postgres LISTEN/NOTIFY dispatch, embedded in the same Next.js deployment. Ports the legacy 13 jobs minus the dropped ones: signature reap, EOL connection expiry, expired-connection cleanup (48h cap), `deleteMapData` (30-day grace cascade), per-system stats refresh (ESI → `ap_system_stats`). New jobs that have no legacy analogue: hourly activity-log materialized-view refresh (`REFRESH MATERIALIZED VIEW CONCURRENTLY ap_activity_rollup`) and daily `pg_partman` partition maintenance. Job duration + failure metrics persist to `ap_job_run`. Row-level cleanups flow through `commitMapEvent` so client tabs see the disappearance.
**Touches:** `src/lib/jobs/runner.ts`, `src/lib/jobs/registry.ts`, `src/lib/jobs/withInstrumentation.ts`, `src/lib/jobs/tasks/*.ts`, `src/db/migrations/0006_jobs.sql`, `src/db/migrations/0007_activity_rollup.sql`, `src/db/views/activity_rollup.sql`, `server.ts`, `src/lib/aperture.config.ts`.
**Done when:** All cron jobs run on schedule for one full week with success metrics visible in `ap_job_run`.
**Deferrals carried elsewhere:** `updateSovereigntyData` → Stage 13; `cleanUpCharacterData` → Stage 15; full `structure-resolve` handler body → Stage 17 (Stage 11 ships only a no-op stub so the cron entry and observability row exist).

### Stage 12 — Server-side character location tracking (hot path)
**Goal:** One `graphile-worker` job per tracked character, running independent of any tab. Adaptive polling intervals (`LOCATION_POLL_ONLINE_MS` / `LOCATION_POLL_OFFLINE_MS`) hard-coded. On a non-gate-adjacent location change (lookup against `universe_stargate_edge`), upsert both systems onto the map and create an assumed wormhole connection. Closing a tab does not stop tracking.
**Touches:** `src/lib/jobs/locationPoll.ts`, `src/lib/map/locationToConnection.ts`.
**Done when:** A character tracked with no browser tab open still emits map updates; gate jumps are not falsely flagged as wormholes.

### Stage 13 — Read-side external integrations
**Goal:** zKillboard client (recent kills overlay), EVE-Scout sync, DOTLAN/EVEEYE/Anoik deep links, CCP image server URL helpers, GitHub changelog fetch. All client modules use the Stage 4 ESI pattern (Zod-decoded, breakered) where applicable. Also lands the legacy `updateSovereigntyData` job (deferred from Stage 11): a `sov-fw-refresh` graphile-worker task hosted on the Stage 11 runtime that pulls `getSovereigntyMap` + `getFactionWarSystems` from ESI and writes the sov/FW state used by the intel sidebar.
**Touches:** `src/lib/integrations/zkb.ts`, `src/lib/integrations/evescout.ts`, `src/lib/integrations/github.ts`, `src/components/sidebar/IntelModule.tsx`, `src/lib/jobs/tasks/sovFwRefresh.ts`.
**Done when:** Intel/killboard modules show live data; deep links resolve to the right external pages; the `sov-fw-refresh` job is running on schedule with success in `ap_job_run`.

### Stage 14 — Webhook fan-out
**Goal:** Slack + Discord dispatcher reading `ap_map_webhook` rows. Rally events and history events fan out to the configured channels. Failure modes (404 webhook, rate limit) surface to the admin UI but never block the underlying map mutation.
**Touches:** `src/lib/webhooks/dispatcher.ts`, `src/db/schema/pf/webhook.ts`.
**Done when:** SPEC §9 Phase 3 gate is green — §§ 7, 9, 11 of the feature matrix work; webhook delivery proven against test channels.

---

## Phase 4 — Admin, permissions, parity catch-up

### Stage 15 — Permissions & access control
**Goal:** `ap_role`, `ap_character_role`, `ap_map_role_access`, `ap_corporation_right` modeled and wired. `authz_level` enum gates admin actions; `character_status` enum enforces kick/ban. Every controller action has an explicit server-side right check (closes SPEC §11 Q8 — the legacy `map_share` / `map_import` / `map_export` bypass). Also lands the legacy `cleanUpCharacterData` job (deferred from Stage 11): a `character-cleanup` graphile-worker task hosted on the Stage 11 runtime that processes pending `character_status` kick/ban transitions on the schedule the admin actions need.
**Touches:** `src/db/schema/pf/role.ts`, `src/lib/auth/rights.ts`, `src/lib/auth/middleware.ts`, `src/lib/jobs/tasks/characterCleanup.ts`.
**Done when:** Role-restricted maps are invisible to non-role characters across both API and UI; integration tests prove no bypass path remains; `character-cleanup` is running on schedule with success in `ap_job_run`.

### Stage 16 — Admin panel + setup wizard
**Goal:** Admin routes for maps list, members, notification config, global settings. Kick / ban / activate / hard-delete actions are CSRF-safe and POST-only (no GET mutations). Setup wizard route gated by proxy HTTP Basic. Cookie `SameSite` / `Secure` flags set in app code (closes SPEC §11 Q9). Decide kick/ban orphaning rule (Q10) and document it.
**Touches:** `src/app/(admin)/admin/**`, `src/app/(setup)/setup/page.tsx`, `src/lib/cookies.ts`.
**Done when:** Every admin action from feature matrix §8 works; setup wizard provisions a fresh deployment end-to-end.

### Stage 17 — UI modules & dialogs catch-up
**Goal:** Sweep the remaining 13 dialogs and 13 modules from spec docs 06–08 — gallery, task manager, shortcuts panel, status pages, system info dialog, system effects, killboard popouts, etc. — to feature-matrix parity. Replace DataTables (TanStack Table), Summernote (Tiptap), PNotify (sonner) wholesale per SPEC §5.4. Also lands the structure intel module's data dependencies: introduces `ap_structure` (and any related rows), and fills in the body of the `structure-resolve` graphile-worker task that Stage 11.6 registered as a no-op stub — handler resolves stale `ap_structure` rows via ESI `getUniverseStructure` on the Stage 11 runtime.
**Touches:** `src/components/modules/**`, `src/components/dialogs/**`, `src/db/schema/ap/structure.ts`, `src/db/migrations/<next>_structure.sql`, `src/lib/jobs/tasks/structureResolve.ts` (replace stub with real handler).
**Done when:** SPEC §9 Phase 4 gate is green — every row in feature-matrix §§ 1–14 not dropped in §8.2 has a working implementation; SPEC §11 open-question list is closed except deferred items; `structure-resolve` is doing real work (no longer returning the `deferred: 'stage-17'` marker into `ap_job_run.notes`).

---

## Phase 5 — Cutover

### Stage 18 — Migration tooling
**Goal:** One-shot `pgloader` script for legacy `pathfinder.*` → `ap_*` mapping; row counts + per-table checksum validators; legacy history-file leak cleanup script (closes SPEC §11 Q7); "Remember me" cookie one-shot reader that resolves legacy selector+validator against an imported snapshot of `character_authentication` and reissues an Auth.js session.
**Touches:** Separate `aperture-migrate/` repo (per SPEC §6.3 — not committed to the app).
**Done when:** Migration scripts run dry against a copy of the production DB and produce a verified Postgres dataset; "Remember me" rehydration round-trip tested end-to-end.

### Stage 19 — Cutover & post-launch
**Goal:** Production cutover. Final MySQL → Postgres migration during downtime window; DNS / proxy flip; legacy app demoted to read-only export-only mode; "Remember me" migration window opens (≥30 days); P1 bug watch.
**Touches:** Deployment configuration, DNS, proxy config, post-cutover monitoring dashboards.
**Done when:** SPEC §9 Phase 5 gate is green — no P1 bugs for 7 consecutive days; "Remember me" window closes and the legacy cookie reader + imported rows are removed.

---

## Cross-cutting tracks

These run alongside the staged phases rather than as discrete blocks. Each stage above is expected to contribute to them as it lands; calling them out here so they don't fall through the cracks.

- **Companion `.md` discipline** — every `.ts`/`.tsx` file gets its companion `.md` per CLAUDE.md's standing instruction, from Stage 0 onward.
- **Shared types** — domain types live in `src/types/index.ts`; DB-derived types use Drizzle's `InferSelectModel` / `InferInsertModel`. Stages 1, 2, 6, 11, 15 are the main contributors.
- **Observability** — job duration, ESI circuit-breaker state, WebSocket health, degraded-mode banner triggers. Wired progressively from Stage 8 onward.
- **Testing posture** — Vitest for unit/integration; Playwright for E2E starting at Phase 2; each phase's gate is enforced by a dedicated test suite added in that phase's final stage.
- **Documentation** — keep `docs/spec/SPEC.md` in sync if a stage discovers something the spec didn't anticipate; update `docs/spec/` source docs rather than adding parallel notes.

---

## Verification

This roadmap itself doesn't ship code; verification is that each stage's "Done when" is testable, and that the union of stages covers SPEC §3 (Functional requirements), §8 (Keep / Drop / Redesign), and §11 (Open questions).

Spot-check coverage:
- All 11 SPEC §11 open questions appear: Q1/Q2 → §8.2 (resolved in spec, no stage needed); Q3/Q6 → Stage 3; Q4 → Stage 2; Q5 → Stage 4; Q7 → Stage 18; Q8 → Stage 15; Q9/Q10 → Stage 16; Q11 → Stage 6 (month-partitioned `ap_map_event`).
- All §8.3 Redesign rows are covered: realtime (8), static-data (1), auth (2), config (0), map-history (6), soft-delete (6/9), system-stats (11), sessions (2), background queue (11), map engine (7), build (0).
- Feature-matrix §§ 1–14 land at the SPEC §10 phase gates (1/3 at Stage 7; 2/3/4/5/6/12/13 at Stage 10; 7/9/11 at Stage 14; 8/10/14 at Stage 17; full matrix at Stage 19).

When a stage starts, the first action in its dedicated session is to expand this stub into a `docs/plans/<stage-name>.md` sub-plan per CLAUDE.md's planning protocol.
