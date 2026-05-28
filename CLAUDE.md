# Aperture — Claude Code Working Notes

Aperture is a collaborative wormhole-mapping web app for EVE Online. This repo is the **rebuild** of the legacy Pathfinder (F3 + jQuery/jsPlumb + MySQL) implementation onto Next.js + TypeScript + Drizzle + Postgres.

The behavior-level spec is in [docs/spec/](docs/spec/). The assembly document (start here) is [docs/spec/SPEC.md](docs/spec/SPEC.md).

---

## How to Find Things

| I want to understand... | Start with... |
|---|---|
| The full rebuild blueprint | `docs/spec/SPEC.md` |
| Behavior-level spec (legacy app, authoritative) | `docs/spec/00-overview.md` … `docs/spec/10-feature-matrix.md` |
| Shared TS types | `src/types/index.md` |
| Drizzle schema (tables, enums, FKs) | `src/db/schema.md` |
| Database migrations | `src/db/migrations/` (Drizzle Kit) |
| Auth.js EVE SSO provider + token rotation | `src/lib/auth.md` |
| ESI client (circuit breakers, Zod decoders) | `src/lib/esi/client.md` |
| Background jobs (graphile-worker) | `src/lib/jobs/index.md` |
| Server-side character location tracking | `src/lib/jobs/locationPoll.md` |
| Realtime fanout (`pg_notify` ↔ WebSocket) | `src/lib/realtime/bus.md` |
| WebSocket server (custom Node `server.ts` upgrade handler) | `src/lib/realtime/wsServer.md`, `server.md` |
| Browser SharedWorker WebSocket client | `src/lib/realtime/sharedWorker.md` |
| Client realtime provider + degraded banner | `src/lib/realtime/useRealtime.md`, `src/components/RealtimeStatusBanner.md` |
| Map engine (xyflow) | `src/components/map/MapCanvas.md` |
| Map mutation pathways (Server Actions / API) | `src/app/api/map/README.md` |
| Webhook fan-out (Slack / Discord) | `src/lib/webhooks/dispatcher.md` |
| SDE / ESI static-data ingest | `src/lib/jobs/sdeIngest.md` |

---

## Development Conventions

### Companion `.md` files — Standing Instruction

**This is a standing instruction that applies to every file edit in this project, without exception:**

> Whenever you create or modify a `.ts` or `.tsx` file, you must update its companion `.md` file in the same operation. If no companion exists yet, create it. Use the formats defined below.

Every `.ts` and `.tsx` source file in the codebase has a companion `.md` file at the same path with the same base name. These files serve as a cheap, always-current index of the codebase for Claude Code. Rather than reading entire source files to understand relationships and interfaces, Claude Code reads the `.md` files first and only opens the source when it actually needs to modify it.

```
src/
├── components/
│   ├── map/
│   │   ├── MapCanvas.tsx
│   │   ├── MapCanvas.md          ← companion
│   │   ├── SystemNode.tsx
│   │   ├── SystemNode.md
├── lib/
│   ├── esi/
│   │   ├── client.ts
│   │   ├── client.md
│   ├── realtime/
│   │   ├── bus.ts
│   │   ├── bus.md
```

Companion files are maintained by Claude Code as a standing instruction. They are never edited by hand and require no external script or API call. The companion must be written or updated **before** the edit is considered complete.

#### For `.tsx` component files

```markdown
## ComponentName

**Purpose:** One sentence describing what this component does.
**File:** `src/components/ComponentName.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| propName | string | yes | What it controls |
| onSave | (m: MapSystem) => void | yes | Called when the inspector commits |
| isVisible | boolean | no | Defaults to true |

### Renders
Brief description of what the component produces visually.

### Behaviour & Interactions
- Bullet list of non-obvious behaviours, state transitions, or side effects
- e.g. "Position changes are debounced 200ms before firing the mutation"
- e.g. "Switching system status optimistically updates the local cache before the server confirms"

### Emits / Calls
- `onSystemChange(system)` — fired on every committed field change
- `useRealtimeBus()` — subscribes to `map:<id>` envelopes from context

### Depends On
- `SystemStatusPicker` — enum dropdown bound to `system_status`
- `IntelNotesEditor` — Tiptap-backed rich text input

### Local State
- `editingAlias: boolean` — whether the alias field is in edit mode
```

Omit any section that has nothing to say.

#### For `.ts` module files

```markdown
## moduleName.ts

**Purpose:** One sentence describing the module's responsibility.
**File:** `src/lib/moduleName.ts`

---

### functionName(param: Type, param2: Type): ReturnType
What this function does. Any side effects, error conditions, or performance notes.

**Parameters:**
- `param` — what it is
- `param2` — what it is

**Returns:** What the return value represents.

---

### anotherFunction(...)
...
```

Document only exported symbols. Omit internal helpers.

### Types
All shared domain types live in `src/types/index.ts`. Do not define project-domain types inline in components or services — add them to `index.ts` and import from there. Database-derived types are inferred from the Drizzle schema (`InferSelectModel` / `InferInsertModel`) and re-exported from `src/types/index.ts`.

---

## Stack & Architectural Rules

These rules come straight from [docs/spec/SPEC.md](docs/spec/SPEC.md) §§5–7. Treat them as load-bearing — deviations need an explicit reason recorded in a plan doc.

### Stack
- **Next.js 16+ App Router**, **React 19**, **TypeScript 6+**, **Drizzle ORM**, **Postgres 18**, **Auth.js v5**, **Node 24 LTS**.
- **No Redis.** Sessions are stateless JWT. Background queue is Postgres-backed (`graphile-worker`). Realtime fanout is Postgres `LISTEN/NOTIFY`. Hot caches are in-process LRU.
- UI primitives: **shadcn/ui**, **TanStack Table**, **Tiptap**, **sonner** (toasts). Map canvas: **xyflow (react-flow)** — do **not** reach for jsPlumb or imperative DOM map libraries.

### Database
- **Single Postgres database, single schema.** The legacy `pathfinder` / `eve_universe` split is gone.
- **Table-name prefixes are mandatory, no exceptions:** every user-data table starts with `ap_`; every static CCP-data table starts with `universe_`.
- **Column casing:** `snake_case` in the DB, `camelCase` on the TS side via Drizzle's `name:` mapping.
- **All time columns are `timestamptz`.** No naked `timestamp`.
- **IDs:** `generated always as identity` (or `bigserial` where natural). EVE IDs are 64-bit — use `bigint`.
- **JSON:** always `jsonb`, never `json`.
- **Small lookup tables become `pgEnum`s** (e.g. `map_scope`, `system_status`, `connection_scope`, `wh_mass`, `authz_level`). Don't introduce a lookup table when an enum will do.
- **Real foreign keys across former schema boundaries.** `ap_map_system.system_id → universe_system.id` is a normal FK with `ON DELETE RESTRICT`. No application-level joins for what should be SQL.
- **Audit `character_id` is `ON DELETE SET NULL`.** Erasing a character must not cascade-wipe their map/system/connection history.

### Mutation pathways (one canonical commit point per change)
There are exactly three pathways. Pick the right one; do not invent a fourth.

| Trigger | Mechanism |
|---|---|
| User clicked / typed in the UI | Server Action *or* JSON API route |
| Server observed something external | Background job → DB write → `ap_map_event` insert → `pg_notify` → WS push |
| Cross-tab fan-out of either above | WebSocket server → client only |

- The **WebSocket is broadcast-only.** Clients never send mutations over it.
- Every mutation lands as exactly **one `INSERT INTO ap_map_event`**. An `AFTER INSERT` trigger emits `pg_notify('map:'||map_id, …)`. The WS handler picks it up. No application-level dual-write.
- **Server Actions** for low-traffic state changes where a fresh render is the natural next step (account settings, map create/delete, admin settings).
- **JSON API routes** for high-frequency client-initiated mutations (signature edits, system drag, connection type change).

### Realtime
- **Native WebSocket served by the same Next.js deployment.** Not a separate process.
- **Postgres `LISTEN/NOTIFY`** is the only fanout mechanism. The channel the `ap_map_event` trigger publishes to is the channel the WS handler subscribes to. Job dispatch uses the same mechanism.
- **SharedWorker** on the browser — one character with many tabs holds exactly **one** socket.
- Task vocabulary is fixed: `mapUpdate`, `mapAccess`, `mapConnectionAccess`, `mapDeleted`, `characterUpdate`, `characterLogout`, `healthCheck`, `logData`, plus client→server `subscribe` / `unsubscribe`. Don't invent new task names without updating the spec.
- If realtime is unhealthy, the UI **must** surface a degraded-mode banner — never silently render stale state.

### Background jobs
- Single Node job runner backed by **`graphile-worker`**. No Redis.
- **Character location tracking runs server-side**, one job per tracked character — never coupled to a tab being open.
- Polling cadence is adaptive on `online` state; intervals are **hard-coded constants** (`LOCATION_POLL_ONLINE_MS`, `LOCATION_POLL_OFFLINE_MS`). No `pathfinder.ini`-style runtime knob.

### Auth & ESI
- **Auth.js v5** with a custom **EVE SSO** OAuth2 provider.
- **ESI tokens live on `ap_character`** (`esi_access_token`, `esi_refresh_token`, `esi_access_token_expires`, `esi_scopes`). Tokens are **encrypted at rest** (pgcrypto or app-layer AEAD).
- **Refresh-token rotation is persisted on every token exchange**, *before* the new access token is consumed by any caller. This closes the highest-priority latent bug from the legacy app. Cover it with an integration test.
- **JWK cache:** fetch on cold start, refresh on signature failure, capped at one re-fetch per 10s.
- **Per-endpoint circuit breakers** on ESI. Treat the CCP downtime window (`±8m` around `CCP_SSO_DOWNTIME`) as expected.
- **All ESI responses go through Zod decoders.** ESI schema drift must surface as a decoder error, not a silent `undefined` cascade.
- **Admin gating** uses the `ap_character.authz_level` enum, not a second Auth.js provider.
- **Kick / ban orphaning (SPEC §11 Q10):** kick/ban status lives on `ap_character.status` and is cascade-removed with the account (`ap_character` → `ap_user` is `ON DELETE CASCADE`). A player returning under a new account on the same character lands with `status='active'`; the prior kick/ban does not revive. See `docs/spec/09-permissions-and-admin.md` Q7 for the canonical record.
- **`/setup` ops console (Stage 16.6):** bypasses EVE SSO and is gated by `SETUP_PASSWORD` (`.env`) + a signed short-TTL `ap_setup` cookie (`src/lib/auth/setup-cookie.ts`). Operators may layer proxy auth in front for defense in depth. Production deploys with empty `SETUP_PASSWORD` fail fast at import.

### Config
- Env vars + a typed `aperture.config.ts` for app constants. Do not reintroduce `.ini` files.
- Do not gate behavior on runtime config that should be a hard-coded constant (see job cadences above).

### Lifecycle patterns
- **Do not add a generic `active` boolean** to operational tables. The legacy mistake. Pick the right mechanism per case:
  - `ap_map_system.visible` for "currently shown on the map" (rows persist across invisibility cycles).
  - `ap_map.deleted_at` for two-phase map deletion (30-day grace, then purge).
  - **Hard-delete** for `ap_map_connection` — wormholes collapse and don't come back.
  - Status enums (`character_status`, etc.) where a state machine is the real model.
- **History lives in `ap_map_event`**, partitioned monthly. Never write NDJSON history files. Never dual-write to a parallel audit table.

### Code style
- Don't add features, refactor, or introduce abstractions beyond what the task requires.
- Don't write comments that explain *what* the code does — naming should carry that. Comments are for non-obvious *why*: a constraint, an invariant, a workaround for a specific bug.
- Trust internal code and framework guarantees; validate only at system boundaries (user input, external APIs / ESI).
- No backwards-compatibility shims for legacy URL shapes, cookie formats, or DB columns. The one exception is the documented "Remember me" cookie migration window (spec §7).

---

## Planning Mode

If a task is too large to complete in a single session, **do not try to power through it.** Instead:

1. Write a staged plan to `docs/plans/<feature-name>.md`. Each stage must be independently executable and end at a natural checkpoint (a passing test, a green build, a working but feature-flagged path).
2. For each stage, label which Claude Code mode the user should start the session in:
   - **`Plan mode`** — when the stage involves design decisions, exploring unknowns, or touching files whose impact you cannot fully predict. Use plan mode so the user can review the approach before any file is written.
   - **`Accept edits`** — when the stage is mechanical execution against a clear, already-agreed spec (e.g. "translate this Drizzle schema into migration files", "wire up these props to the existing context"). Use accept-edits mode so the user isn't prompted for every file write.
3. After writing the plan file, tell the user:
   - The plan is at `docs/plans/<feature-name>.md`.
   - **They should start a new session for each stage** (a fresh context window keeps each stage focused).
   - For each session: open the plan, read the stage, then enter the mode the stage specifies (`Shift+Tab` cycles between Plan mode and Accept-edits mode), and tell Claude to execute that stage.

Plan files follow this shape:

```markdown
# <Feature Name>

**Goal:** One sentence.
**Spec references:** Links into `docs/spec/`.

## Stage 1 — <short name>
**Mode:** Plan mode
**Goal:** ...
**Touches:** `src/...`, `src/...`
**Done when:** ...

## Stage 2 — <short name>
**Mode:** Accept edits
**Goal:** ...
**Touches:** ...
**Done when:** ...
```

Keep stages small enough that each fits comfortably in a single session.
