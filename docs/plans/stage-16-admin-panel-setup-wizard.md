# Stage 16 — Admin Panel + Setup Wizard

**Goal:** Operator-facing admin surface at `/admin/*` (maps, members, notification config, global settings — all CSRF-safe, POST-only) and a thin `/setup` ops console gated by an in-app shared password (operator-set in `.env`). Cookie `SameSite` / `Secure` flags set in app code (closes SPEC §11 Q9). Kick/ban orphaning rule documented (closes SPEC §11 Q10).
**Spec/roadmap:** `docs/plans/rebuild-roadmap.md` Stage 16; `docs/spec/09-permissions-and-admin.md`; SPEC §5.1 (mutation pathways), §11 Q9 / Q10.

## Context

Stage 15 shipped everything Stage 16 stands on:
- `ap_character.authz_level` (`member | manager | admin`) with `'admin'` auto-promoted from EVE `Director`, `'manager'` reserved for explicit admin-panel grants (`src/db/schema/ap/enums.ts`, `src/lib/auth/syncCharacterAuthz.ts`).
- `ap_character.status` + `status_expires_at` + `status_reason` state machine with the `character-cleanup` cron flipping `kicked → active` on expiry (`src/lib/jobs/tasks/characterCleanup.ts`).
- `ap_corporation` registry, `ap_corporation_right` two-key matrix, `ap_role` / `ap_character_role` / `ap_map_role_access` overlay (`src/db/schema/ap/{corporation,corporation_right,role}.ts`).
- `ap_map_webhook` per-map subscription rows with `last_status` / `last_error` / `consecutive_failures` observability columns (`src/db/schema/ap/webhook.ts`, dispatched by Stage 14 `webhookDispatch.ts`).
- `ap_map` owner FKs + `deleted_at` two-phase lifecycle; the `map-purge` cron hard-purges after 30-day grace (`src/lib/jobs/tasks/mapPurge.ts`).
- The rights module — `canViewMap` / `canMutateMap` / `isAdmin` / `requireMapRight` / `viewableMapPredicate` (`src/lib/auth/rights.ts`).

What's missing is the **UI + Server Actions** that drive these schemas, the cookie hardening Auth.js v5 doesn't set by default (only the bespoke `ap_link` cookie does — `src/lib/auth/link-cookie.ts:46-55`), the `/setup` route the deploy story needs, and an explicit Q10 rule.

There is no `(admin)` or `(setup)` route group yet; no `src/lib/cookies.ts`; no admin Server Actions. Stage 16 is almost entirely additive — the only schema touch is potentially a one-liner default on `apMapWebhook.consecutiveFailures` if we discover a missing index.

**Decisions (confirmed with user):**
- **Setup wizard scope:** thin ops console — buttons to run pending Drizzle migrations, trigger SDE ingest, trigger one named graphile-worker job on-demand. No DB-truncate, no cookie-invalidate (CLI-only for destructive things).
- **Scoping:** `admin` is global; `manager` is corp-scoped (sees only rows tied to their `corporation_id`). Mirrors legacy SUPER vs CORPORATION (`docs/spec/09-permissions-and-admin.md:172-178`).
- **Webhook UI:** nested under each map (`/admin/maps/[mapId]/webhooks`), per-map list + per-row `last_status` readout + test-fire button. Matches the per-map ownership of `ap_map_webhook`.
- **Kick/ban orphaning (Q10):** kick/ban dies with the character via the existing `ap_user → ap_character` cascade. If the player returns under a new account on the same character, owner-hash match revives the character `active`. Permanent character-level blocks (independent of account) are out of scope; a future `ap_blocklist (owner_hash)` table is the documented extension point.
- **Kick durations:** legacy presets — 5 / 60 / 1440 minutes, three buttons. No custom input.
- **Map delete UX:** two-step. Active map → admin button = soft-delete (sets `deleted_at`, identical to user action). Soft-deleted map → admin button = `purge-now` (hard-delete immediately, skipping the 30-day grace) plus `restore` (clears `deleted_at`).
- **Setup gating:** in-app shared password (`SETUP_PASSWORD` in `.env`) + signed short-TTL cookie. Deliberate deviation from SPEC §11 Q2's "proxy HTTP Basic" answer — avoids mandating container-level proxy config for the single-`docker compose up` deploy story. Proxy auth is now optional defense-in-depth, not required.
- **Sessioning:** each sub-stage runs in its own Claude Code session — open this file, read the sub-stage, enter its labelled mode (`Shift+Tab`), execute.

## Key facts to reuse (don't re-derive)

- **Authz primitives** — `isAdmin(session)` from `src/lib/auth/rights.ts:243`. Stage 16 adds a sibling `isManagerOrAdmin(session)` + `adminVisibilityScope(session)` returning `{ kind: 'global' } | { kind: 'corp'; corporationId: bigint }` for inside-panel scoping. Reuse the existing `loadActor` helper pattern.
- **Server Action shape** — `'use server'`, `requireSession`, Zod-parse, typed `{ ok: true; ... } | { ok: false; error: string }`. Existing examples in `src/app/(app)/actions/map.ts`. Mutation-on-maps Server Actions call `commitMapEvent` so the change shows up in `ap_map_event` + realtime; non-map admin actions (kick/ban/grant) do not — they bypass the audit pipeline (see "What's NOT in scope" below).
- **Map mutation via `commitMapEvent`** — `src/lib/map/mutations/core.ts`. Stage 16 admin actions on maps emit new kinds: `map.purge` (hard-delete after grace skip), `map.restore` (clear `deleted_at`). Add seed rows to `ap_event_kind` in the migration that introduces them, mirroring how Stage 9 added the existing 12 kinds.
- **Webhook test-fire** — `src/lib/jobs/tasks/webhookDispatch.ts` is the existing async path. Test-fire from admin enqueues a synthetic `webhook-dispatch` job with a fixed message body so it exercises the same dispatcher.
- **Auth.js v5 cookie config** — NextAuth's `cookies:` option accepts per-cookie `name` + `options: { httpOnly, sameSite, secure, path, domain }`. Configured in `src/lib/auth.ts` alongside the existing `providers` / `session` / `callbacks` blocks. Defaults set `httpOnly` + `sameSite: 'lax'` already, but `secure` defaults to `process.env.NODE_ENV === 'production'` — make it explicit so the contract is visible at the call site. SPEC §11 Q9 closure is this one block.
- **Setup cookie scaffold** — `src/lib/auth/link-cookie.ts` is the working template: HMAC-SHA256 over `payloadB64url`, timing-safe verify, short TTL, `httpOnly` / `sameSite: 'lax'` / `secure` in prod cookie. Stage 16 builds a sibling `setup-cookie.ts` against the same pattern (different TTL + payload shape) rather than re-inventing the primitive.
- **shadcn primitives** — `Dialog`, `Button`, `Input`, `Select`, `Sheet` already in `src/components/ui/*`. Use these; don't add a second modal library. `sonner` for toasts (`'sonner'` is in deps; `Toaster` mounted in `(app)/layout.tsx`).
- **Companion `.md` discipline** — every new/edited `.ts` / `.tsx` gets its companion `.md` in the same change (CLAUDE.md standing instruction). Shared domain types in `src/types/index.ts`.

## What is intentionally NOT in scope

- **Cross-cutting admin audit log.** Stage 16 logs admin actions on maps through `commitMapEvent` (so map events show up in `ap_map_event` history). Admin actions on characters / corps / webhooks have no DB-level audit — CLAUDE.md forbids parallel audit tables, and `ap_map_event` is map-scoped. Document the gap; Stage 17's "UI modules & dialogs catch-up" or a follow-up plan decides whether to introduce a new audit surface.
- **External role sync (`source='external'`).** `ap_role` supports it, but Discord / third-party sync writers land in their own stage. The corp-title sync path (`source='corp_title'`) already runs via `syncCharacterAuthz`.
- **Custom kick durations.** Three presets only.
- **Setup-wizard destructive actions.** No truncate-and-recreate, no flush-cookies. Operator runs `pnpm db:migrate` / `pnpm sde:ingest` directly for those; the wizard is a thin trigger surface for the safe subset.
- **CSRF tokens.** Server Actions are POST + same-origin-checked by Next.js — that's the CSRF posture. No additional token layer.
- **Manager promotion via in-game role.** Only `admin` is auto-derived from `Director`. `manager` is admin-set only and survives `syncCharacterAuthz` (`syncCharacterAuthz.md` line 13 confirms the preserved-CASE clause).

---

## Sub-stage 16.1 — Admin route shell, access gate, cookie hardening
**Mode:** Plan mode
**Reason for Plan mode:** introduces a new route group and the load-bearing access gate. Cookie hardening is security-adjacent. Worth confirming the gate semantics + cookie surface before any file write.

**Goal:** A new `(admin)` route group with its own layout, gated by `authz_level >= 'manager'`, plus a `/admin` index page that shows the nav. Auth.js cookie options set explicitly in `src/lib/auth.ts`. Q10 rule documented inline.

**Touches:**
- `src/lib/auth/rights.ts` — add `isManagerOrAdmin(session)` and `adminVisibilityScope(session)` (returns `{ kind: 'global' }` for admin, `{ kind: 'corp'; corporationId }` for manager, `null` for member/none). Reuse `loadActor`. Update `.md`.
- `src/lib/cookies.ts` (+ `.md`) — exports `AUTH_COOKIE_OPTIONS` (`{ httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/' }`) and a one-line doc-string referencing SPEC §11 Q9. Single source of truth so the link-cookie path (`src/lib/auth/link-cookie.ts:46-55`) can also import from here in a follow-up de-dup.
- `src/lib/auth.ts` — add `cookies: { sessionToken: { options: AUTH_COOKIE_OPTIONS }, callbackUrl: { options: AUTH_COOKIE_OPTIONS }, csrfToken: { options: AUTH_COOKIE_OPTIONS } }` to the NextAuth config. Update `.md`.
- `src/app/(admin)/admin/layout.tsx` (+ `.md`) — `requireSession()` then `isManagerOrAdmin(session)`; redirect to `/maps` on fail. Renders a slim admin header (Aperture title + character chip from the existing `CharacterSwitcher` + a "Leave admin" link back to `/maps`) and a left nav with sections: Maps, Members, Settings. Reuses `AppFooter` and the `sonner` `Toaster`. No `RealtimeProvider` — admin pages don't subscribe to map channels.
- `src/app/(admin)/admin/page.tsx` (+ `.md`) — index dashboard: counts of active maps / soft-deleted maps / kicked characters / banned characters / webhooks with `consecutive_failures > 0`. Scoped via `adminVisibilityScope`.
- `src/components/admin/AdminNav.tsx` (+ `.md`) — the left nav primitive used by the layout.
- `docs/spec/09-permissions-and-admin.md` — append a "Q10 — kick/ban orphaning" section recording the cascade-and-revive rule. Keep the spec doc authoritative.
- `CLAUDE.md` — note Q10 closure in the auth section.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- A `member` character visiting `/admin` is redirected to `/maps`; a `manager` character sees the panel (corp-scoped index counts); an `admin` sees global counts.
- Browser-inspect: session, callback-url, csrf-token cookies all carry `HttpOnly`, `SameSite=Lax`, and `Secure` (in prod / over https).
- The Q10 rule is recorded in `docs/spec/09-permissions-and-admin.md`.

## Sub-stage 16.2 — Admin maps list (soft-delete / restore / purge-now)
**Mode:** Plan mode
**Reason for Plan mode:** introduces the only destructive admin actions in Stage 16 (hard-delete bypasses the 30-day grace). Confirm UX + scoping rules before touching `commitMapEvent`.

**Goal:** `/admin/maps` lists maps an admin can see (admin: every map incl. soft-deleted; manager: corp/alliance/private maps owned by their corp's members + their corp / their corp's alliance). Each row has an action menu: `view`, `soft-delete` (active rows), `restore` + `purge now` (soft-deleted rows).

**Touches:**
- `src/db/migrations/<next>_admin_event_kinds.sql` (+ `.rollback.sql`) — `INSERT INTO ap_event_kind (kind, category) VALUES ('map.restore', 'map'), ('map.purge', 'map');`. Stage 11.2 already stripped the `'server-only'` import from `commitMapEvent` so these are safe to fire from jobs OR Server Actions.
- `src/lib/realtime/protocol.ts` — extend `mapEventPayloadSchema` discriminated union with `'map.restore'` (carries `{ id }`) and `'map.purge'` (carries `{ id }`). Update `applyEvent.ts` to handle `map.purge` (drop from local cache if open) and `map.restore` (refetch — admin-only path, no canvas-side optimistic apply).
- `src/lib/map/loadMap.ts` — `listAdminMaps(scope: ReturnType<typeof adminVisibilityScope>): Promise<AdminMapListItem[]>` returns active + soft-deleted rows scoped per `scope`. Distinct from `listViewableMaps` which is per-character view rule.
- `src/app/(admin)/actions/maps.ts` (+ `.md`) — `adminSoftDeleteMap(mapId)` (forwards to existing `deleteMapAction` after admin gate), `adminRestoreMap(mapId)` (clears `deleted_at`, emits `map.restore`), `adminPurgeMap(mapId)` (hard-deletes the `ap_map` row — `ap_map_event` cascade removes its events too; emits `map.purge` *before* the delete inside the transaction so the event is the last thing that fires before the row dies). Each action verifies `isManagerOrAdmin` AND the map is within the actor's `adminVisibilityScope`. `purge-now` additionally requires `authz_level='admin'` (managers can soft-delete but only admins can skip the grace).
- `src/app/(admin)/admin/maps/page.tsx` (+ `.md`) — server component renders the list; client component handles the action menu + confirmation dialogs (`shadcn` `Dialog`, two-tier confirm for purge).
- `src/components/admin/MapActionsMenu.tsx` (+ `.md`) — the dropdown with the three actions.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Integration tests assert: (a) `adminSoftDeleteMap` matches `deleteMapAction` output; (b) `adminRestoreMap` clears `deleted_at` and lands one `map.restore` event; (c) `adminPurgeMap` removes the row and its event partitions cascade-cleaned (assert via `SELECT COUNT(*) FROM ap_map_event WHERE map_id = $1` = 0 after); (d) a manager can't purge.
- Browser: admin sees a soft-deleted map with both `restore` and `purge now` actions; manager sees only `soft-delete` on active maps owned by their corp.

## Sub-stage 16.3 — Admin members (kick / ban / activate / grant-manager)
**Mode:** Accept edits
**Goal:** `/admin/members` lists characters scoped per `adminVisibilityScope` with state + action surface. Three timed-kick buttons (5 / 60 / 1440 min), one ban button (with reason input), one `activate` button (clears kick or ban). For admins only: `grant manager` / `revoke manager` toggle on the row.

**Touches:**
- `src/app/(admin)/actions/members.ts` (+ `.md`) —
  - `adminKickCharacter(characterId: string, minutes: 5 | 60 | 1440, reason?: string)`: sets `status='kicked'`, `status_expires_at = now() + minutes`, `status_reason = reason ?? null`, `status_changed_at = now()`. The `character-cleanup` cron handles expiry — Stage 15.6's bulk UPDATE already covers this case.
  - `adminBanCharacter(characterId: string, reason: string)`: sets `status='banned'`, `status_expires_at = null`, `status_reason = reason`, `status_changed_at = now()`.
  - `adminActivateCharacter(characterId: string)`: sets `status='active'`, `status_expires_at = null`, `status_reason = null`, `status_changed_at = now()`. Works on both kicked and banned rows.
  - `adminGrantManager(characterId: string)` (admin-only): sets `authz_level='manager'` if currently `'member'`. Preserved by `syncCharacterAuthz` (`CASE` clause in `syncCharacterAuthz.ts`). No-op if already `manager` or `admin`.
  - `adminRevokeManager(characterId: string)` (admin-only): sets `authz_level='member'` if currently `'manager'`. Refuses to revoke `'admin'` — admin status is derived and Director-driven.
  - Every action: `requireSession`, `isManagerOrAdmin`, scope check via `adminVisibilityScope` (manager can only act on members of their own corp), Zod-parse, `revalidatePath('/admin/members')`.
- `src/lib/auth/members.ts` (+ `.md`) — `listAdminMembers(scope)` returns `{ id, name, corporationId, allianceId, status, statusExpiresAt, statusReason, authzLevel, lastOnline, lastLocationAt }[]`. Reused by the dashboard counts in 16.1.
- `src/app/(admin)/admin/members/page.tsx` (+ `.md`) — server component table; client component cell for the action menu per row.
- `src/components/admin/MemberActionsMenu.tsx` (+ `.md`) — dropdown with the four action groups; ban dialog accepts a free-form reason.
- `docs/spec/09-permissions-and-admin.md` — under "Open questions", mark Q7 / Q10 as decided (the cascade-and-revive rule referenced from 16.1).

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Integration tests cover: kick sets `status_expires_at` correctly, ban clears expiry, activate works on both, grant/revoke manager flips the level and `syncCharacterAuthz` preserves the manager across a resync (re-run `syncCharacterAuthz` in the test and assert `authz_level` is still `manager`).
- Manager scope test: a manager cannot kick a character in a different corp (action returns `{ ok: false, error }`); admin can.
- Browser: a kicked character logging in is denied per existing `requireSession` semantics (or sees a kicked-banner on their next request — confirm Stage 15's session refresh closes this loop; if not, add a check in `requireSession` that 401s on `status !== 'active'`).

## Sub-stage 16.4 — Per-map webhook subscriptions
**Mode:** Accept edits
**Goal:** `/admin/maps/[mapId]/webhooks` — list `ap_map_webhook` rows for the map plus a form to add (channel ∈ {discord}, event ∈ {history, rally}, url, optional username). Each row shows the per-row observability columns (`last_status`, `last_error`, `consecutive_failures`, `last_attempted_at`) and a `test-fire` button.

**Touches:**
- `src/app/(admin)/actions/webhooks.ts` (+ `.md`) —
  - `adminCreateWebhook({ mapId, channel, event, url, username? })`: INSERT subject to the `ap_map_webhook_map_channel_event_uq` unique constraint (one URL per map / channel / event); admin/manager-scope-checked against map ownership.
  - `adminUpdateWebhook({ id, url?, username? })`: PATCH the row; scope-checked.
  - `adminDeleteWebhook(id)`: DELETE the row; scope-checked.
  - `adminResetWebhookFailures(id)`: zero `consecutive_failures`, clear `last_error` — operator dismisses a failure flag after fixing the URL.
  - `adminTestWebhook(id)`: enqueues a synthetic `webhook-dispatch` job (via `graphile-worker`'s `addJob`) with a `{ test: true, sentAt }` payload. The dispatcher writes back `last_attempted_at` + `last_status` like any real dispatch.
- `src/app/(admin)/admin/maps/[mapId]/webhooks/page.tsx` (+ `.md`) — server component table + add form.
- `src/components/admin/WebhookForm.tsx` (+ `.md`) — controlled form for create/update. URL Zod-validated as `z.string().url()`.
- `src/components/admin/WebhookHealthBadge.tsx` (+ `.md`) — small status pill rendering `OK` / `last status N` / `N consecutive failures`.
- `src/lib/jobs/tasks/webhookDispatch.ts` — minor: ensure the handler accepts a `{ test: true }` flag and renders a `[test]` prefix on the outbound message. No behaviour change for real events.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Integration test: a webhook row with `consecutive_failures = 5` shows the failure badge; `adminResetWebhookFailures` zeroes the counter; `adminTestWebhook` enqueues a job and (mocked dispatcher) the row gets a fresh `last_status`.
- Manager scope test: a manager cannot edit webhooks on a map outside their corp.
- Browser: per-map webhook list renders, test-fire updates the status pill within ~1s of the job tick.

## Sub-stage 16.5 — Global corp-right matrix editor
**Mode:** Accept edits
**Goal:** `/admin/settings` — edit the `ap_corporation_right` matrix. Admin sees every corp; manager sees only their own corp. Per (corp, right) row, set `min_authz_level ∈ {member, manager, admin}` or delete the row (= no grant).

**Touches:**
- `src/app/(admin)/actions/settings.ts` (+ `.md`) —
  - `adminUpsertCorpRight({ corporationId, right, minAuthzLevel })`: upsert on `(corporation_id, right)` PK. Manager scope: `corporationId === actor.corporationId`. Admin scope: any.
  - `adminDeleteCorpRight({ corporationId, right })`: DELETE; same scope rule.
- `src/app/(admin)/admin/settings/page.tsx` (+ `.md`) — server component renders a corp picker (admin only — for managers the table is auto-scoped to their corp) and a 6-row × 4-column matrix (six rights × {none, member, manager, admin}). Default `none` = no row.
- `src/components/admin/CorpRightsMatrix.tsx` (+ `.md`) — the matrix UI. Optimistic-with-rollback on the four-state radio per row; toast on error.
- `src/lib/admin/corpRights.ts` (+ `.md`) — `listCorpsForAdmin(scope)` (admin: every `ap_corporation`; manager: just theirs) and `loadCorpRightsMatrix(corporationId)`.

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Integration test: setting `map_create.minAuthzLevel = 'member'` for corp X allows a `member` in corp X to create a map (assert via `canCreateMap`); setting it back to `manager` blocks them.
- Manager scope test: a manager cannot upsert a right for a different corp.
- Browser: matrix renders, edits persist, toast fires on conflict.

## Sub-stage 16.6 — Setup wizard + final SPEC closures
**Mode:** Plan mode
**Reason for Plan mode:** the route bypasses EVE SSO so an admin can troubleshoot a broken auth deploy. The replacement gate (shared `.env` password + signed cookie) is security-adjacent and deserves a fresh-context review before commit.

**Goal:** `/setup` ops console with three triggers (run pending migrations, run SDE ingest, run-now a named cron job) plus a status panel. Bypasses EVE SSO; gated by an operator-set shared password (`SETUP_PASSWORD` in `.env`) via a one-field unlock form that issues a signed, short-TTL cookie. README + `.env.example` document the env var and the optional proxy-Basic layer for operators who want defense in depth.

**Touches:**
- `src/lib/env.ts` — add `SETUP_PASSWORD: z.string().default('')`. Required in production via the existing `superRefine` block (so a prod deploy with an empty value fails fast on import). Optional in dev/test so the suite still runs without secrets.
- `.env.example` — append a `# Setup wizard` section: `SETUP_PASSWORD=` with a one-line comment ("Required in production. Gates the /setup ops console. Pick a long random string; rotating it invalidates active unlock cookies.").
- `src/lib/auth/setup-cookie.ts` (+ `.md`) — mirrors `link-cookie.ts` structure. `signSetupPayload(nowS)` HMAC-SHA256 keyed on `AUTH_SECRET` over `{ exp }`; `verifySetupPayload(token, nowS)` timing-safe with expiry; `setSetupCookie()` / `readSetupCookie(): Promise<boolean>` / `clearSetupCookie()`. Cookie name `ap_setup`, TTL 4h (long enough for an ops session, short enough that a left-open tab self-locks). Flags from the new `AUTH_COOKIE_OPTIONS` in 16.1.
- `src/app/(setup)/layout.tsx` (+ `.md`) — minimal HTML shell, no `(app)` chrome. Renders an amber banner: "Operator console. Bypasses EVE SSO — gated by `SETUP_PASSWORD`. Rotate the password after every operator-team change."
- `src/app/(setup)/setup/page.tsx` (+ `.md`) — server component: calls `readSetupCookie()`; if unlocked, renders three trigger cards + a status table (latest 20 rows from `ap_job_run` ordered by `started_at DESC`; latest migration version from `__drizzle_migrations`; counts of `ap_map_event` in the last hour). If locked, renders the `SetupUnlockForm`.
- `src/components/setup/SetupUnlockForm.tsx` (+ `.md`) — single-input client form that POSTs to `setupUnlockAction`. Toast on wrong password (constant-time compare, generic "Invalid password" message — no enumeration).
- `src/components/setup/SetupCard.tsx` (+ `.md`) — single-purpose card + button + spinner + result-readout pattern reused for all three triggers.
- `src/app/(setup)/actions.ts` (+ `.md`) —
  - `setupUnlockAction(password: string)`: `timingSafeEqual` compare against `env.SETUP_PASSWORD`. On match, `setSetupCookie()`; on miss, return `{ ok: false, error: 'Invalid password.' }`. Refuses to run if `SETUP_PASSWORD` is empty (so a misconfigured deploy doesn't accidentally accept any password).
  - `setupLogoutAction()`: `clearSetupCookie()`.
  - `setupRunMigrations()`: gate on `readSetupCookie()`; invokes `migrate` from `drizzle-orm/node-postgres/migrator` against the configured `DATABASE_URL`. Returns the count of newly applied migrations + a list of their filenames. Idempotent — re-running with no pending work returns `{ applied: 0 }`.
  - `setupRunSdeIngest()`: gate; enqueues the existing `sde-ingest` graphile-worker job. Returns the queued job id.
  - `setupRunCronOnDemand(name: string)`: gate; validates `name` against the `taskRegistry` from `src/lib/jobs/registry.ts`, then `addJob(name, {})`. Returns the queued job id.
  - Every gated action emits a `console.warn` line with `x-forwarded-for` and the action name so the proxy log + app log can be cross-referenced. No DB audit.
- `README.md` — append a `## Deployment` section: required env vars (including `SETUP_PASSWORD`) and a "defense in depth" note that the operator MAY ALSO front `/setup` with proxy-level auth (nginx Basic / Cloudflare Access), but the app gate is the floor and the deployment is safe without it provided `SETUP_PASSWORD` is set.
- `docs/spec/09-permissions-and-admin.md` — under "Known issues / quirks" and under the §11 Q2 answer block, record the deviation from the original "proxy HTTP Basic" answer: Stage 16 ships an in-app `SETUP_PASSWORD` gate to avoid mandating container-level proxy config; proxy-level auth is now optional, not required.
- `CLAUDE.md` — single-line note in the auth section: "/setup bypasses EVE SSO and is gated by `SETUP_PASSWORD` (`.env`) + a signed short-TTL cookie. Operators may layer proxy auth in front for defense in depth."

**Done when:**
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Manual smoke: `pnpm dev` with `SETUP_PASSWORD=test` set → visit `/setup` → empty input rejected; correct password unlocks; reload keeps unlock state until cookie expires; "Run pending migrations" with no pending migrations returns `{ applied: 0 }`; with a planted pending file, it applies and reports the filename.
- Integration tests:
  - `setupUnlockAction` with an empty `SETUP_PASSWORD` env returns an error (no accidental open-deploy).
  - `setupUnlockAction` with a wrong password returns `{ ok: false }` and does not set a cookie.
  - All three trigger actions return `{ ok: false, error: 'Locked.' }` when the cookie is absent.
  - `setupRunCronOnDemand('invalid-job-name')` returns an error; `setupRunCronOnDemand('signature-reap')` enqueues exactly one row in `graphile_worker.jobs`.
- README, `.env.example`, SPEC, and `CLAUDE.md` carry the documented posture; the page renders the unlock banner pre-unlock and the trigger cards post-unlock.

---

## Verification

End-to-end:
- **Access gate** — `member` → `/admin/maps` redirects to `/maps`; `manager` sees corp-scoped panel; `admin` sees global.
- **POST-only invariant** — `tests/integration/admin/no-get-mutations.test.ts` walks every file under `src/app/(admin)/admin/**/route.ts` (should be empty — admin uses Server Actions, not route handlers) and grep-asserts no `export async function GET` in the tree.
- **CSRF posture** — Server Actions are POST + same-origin checked by Next.js. The cookie hardening test asserts `Set-Cookie` lines for `authjs.session-token` carry `HttpOnly; SameSite=Lax; Secure` (Secure only in production env; assert via NODE_ENV-swap test).
- **Audit chain** — admin map actions (soft-delete / restore / purge) each land exactly one `ap_map_event` row; the realtime fanout test confirms each fires its `pg_notify` envelope.
- **Manager-scope leak test** — every `adminXxx` Server Action has a test where a manager in corp B is denied an action against a target in corp A. Twelve targeted test cases.
- **Setup wizard** — running migrations is idempotent; an invalid cron name is rejected; a valid one enqueues; locked actions are refused.
- **Cookie hardening** — `tests/integration/auth/cookie-flags.test.ts` asserts the session / callback-url / csrf-token cookies all carry the expected flags. Closes SPEC §11 Q9.
- **Q10 rule** — `docs/spec/09-permissions-and-admin.md` carries the documented rule; `CLAUDE.md` notes it.

Stage 16 ends with the SPEC §9 Phase 4 gate green: every admin action from feature matrix §8 has a working implementation; setup wizard provisions a fresh deployment end-to-end; Q9 and Q10 are closed.
