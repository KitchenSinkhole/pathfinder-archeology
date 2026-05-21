# Contributing to Aperture

Aperture is the Next.js + TypeScript + Drizzle + Postgres rebuild of the legacy Pathfinder wormhole-mapping app. The rebuild is staged — work proceeds through a fixed sequence of checkpoints rather than being assigned ad-hoc. This document explains how to pick up a stage, work it to completion, and hand off cleanly.

If you've never opened the repo before, read these first in order:

1. [README.md](README.md) — what the app is
2. [docs/spec/SPEC.md](docs/spec/SPEC.md) — the rebuild blueprint (architecture, data model, auth, phased migration)
3. [docs/plans/rebuild-roadmap.md](docs/plans/rebuild-roadmap.md) — the 20-stage roadmap from green-field scaffold to production cutover
4. [CLAUDE.md](CLAUDE.md) — working conventions (companion `.md` files, stack rules, planning protocol)

---

## How the staged build works

The roadmap in [docs/plans/rebuild-roadmap.md](docs/plans/rebuild-roadmap.md) defines 20 stages grouped into six phases (Phase 0 through Phase 5). Stages are sequential: do not start Stage N+1 until Stage N's "Done when" condition has been met and merged to `master`.

Each stage in the roadmap is a **stub** — a goal, a list of files it touches, and a checkpoint. Before any code is written for a stage, the stub must be expanded into a full sub-plan at `docs/plans/<stage-name>.md` describing how it will be executed.

The flow for any single stage:

```
1. Read the stub in docs/plans/rebuild-roadmap.md
2. Open a fresh Claude Code session in Plan mode
3. Expand the stub into docs/plans/<stage-name>.md
4. Get the sub-plan reviewed
5. Switch the session to Accept-edits mode and execute the sub-plan
6. Verify the "Done when" condition
7. Commit and open a PR
```

Each step is covered below.

---

## Step 1 — Pick the next stage

The next stage is always the lowest-numbered stage in [docs/plans/rebuild-roadmap.md](docs/plans/rebuild-roadmap.md) without a corresponding completed PR. Do not skip ahead; the roadmap's dependencies are real — Stage 4 (ESI client) cannot land without Stage 3 (opKey mapping), Stage 7 (read-only map) needs Stage 6 (schema), etc.

If you believe a stage should change order, open an issue against the roadmap before you start work. Don't fork the sequence.

## Step 2 — Open a fresh session in Plan mode

Each stage gets its own Claude Code session. Fresh context per stage keeps the planning focused and avoids drift. Enter Plan mode (`Shift+Tab` cycles modes) before any tool calls.

Tell Claude (or work yourself) to:

- Re-read the stage stub in `docs/plans/rebuild-roadmap.md`
- Re-read the relevant spec docs from `docs/spec/` (the stub lists the architecture sections it depends on)
- Re-read [CLAUDE.md](CLAUDE.md) so the stack rules and companion-file conventions are loaded

## Step 3 — Expand the stub into a sub-plan

Write the sub-plan to `docs/plans/<stage-name>.md` using the format CLAUDE.md prescribes:

```markdown
# <Stage N — Short Name>

**Goal:** One sentence (copy from the roadmap stub).
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

Keep each sub-stage small enough to fit in a single session. A stage that won't fit in 3–4 sub-stages is a sign the original roadmap stub is too large — flag it.

**Mode labels matter.** Mark each sub-stage either `Plan mode` (design decisions, unknowns, anything whose impact you cannot fully predict) or `Accept edits` (mechanical execution against an already-agreed spec). Reviewers and future sessions rely on these labels.

## Step 4 — Get the sub-plan reviewed

Open a PR with just the new `docs/plans/<stage-name>.md` file. Reviewers check:

- Does the sub-plan execute the roadmap stub faithfully?
- Are the SPEC §§5–7 architectural rules respected? (table prefixes, `timestamptz`, no Redis, three mutation pathways, etc.)
- Are the sub-stage `Done when` conditions verifiable?
- Are the mode labels right?

Don't write code until this PR merges. Plan changes are cheap; rework after code lands is not.

## Step 5 — Execute the sub-plan

Open a second session per sub-stage. Read the sub-plan, enter the mode the sub-stage specifies, and execute. The standing instruction from [CLAUDE.md](CLAUDE.md) applies throughout — **every `.ts` or `.tsx` file edit must update its companion `.md` file in the same commit**, no exceptions.

When a sub-stage finishes, open its PR before starting the next one. Each sub-stage PR should:

- Be reviewable in a single sitting
- Have a green CI build (`pnpm typecheck`, `pnpm lint`, `pnpm test`)
- Contain the companion `.md` updates alongside the code changes
- Reference the parent stage in the description (e.g. "Part 2/3 of Stage 6")

## Step 6 — Verify the "Done when" condition

When the last sub-stage of a roadmap stage merges, the roadmap's "Done when" line must be demonstrably true. For most stages this means:

- A test exists and passes that exercises the checkpoint
- The relevant spec doc still describes the implemented behavior (update the spec if reality diverged — never let the spec rot)
- A short note in the stage's sub-plan records what was checked

For phase-boundary stages (7, 10, 14, 17, 19) the SPEC §10 phase gate must also be green — the feature-matrix rows listed for that phase produce the same observable outcome as the legacy app.

---

## Working conventions (recap from CLAUDE.md)

These rules are not optional. They come straight from [CLAUDE.md](CLAUDE.md) and [SPEC.md](docs/spec/SPEC.md) §§5–7. PRs that violate them will not be merged.

### Companion `.md` files
Every `.ts` / `.tsx` file has a companion `.md` at the same path with the same base name. Created or updated **in the same commit** as the source change. Format is documented in [CLAUDE.md](CLAUDE.md) under "Companion `.md` files — Standing Instruction". This is the single most-likely-to-be-forgotten rule.

### Stack rules
- Next.js 15+ App Router · React 19 · TS 5+ · Drizzle ORM · Postgres 16 · Auth.js v5 · Node 22 LTS
- **No Redis.** Sessions are stateless JWT; queue is `graphile-worker`; realtime fanout is `LISTEN/NOTIFY`; caches are in-process LRU
- UI: shadcn/ui, TanStack Table, Tiptap, sonner. Map canvas: **xyflow** — never jsPlumb

### Database rules
- Single Postgres database, single schema
- User-data tables → `pf_` prefix. Static CCP-data tables → `universe_` prefix. No exceptions
- `snake_case` columns; `camelCase` on the TS side via Drizzle's `name:` mapping
- All time columns are `timestamptz`
- IDs are `generated always as identity` or `bigserial`; EVE IDs are `bigint`
- JSON is `jsonb`, never `json`
- Small lookups are `pgEnum`s, not tables
- Cross-domain joins use real foreign keys

### Three mutation pathways
Pick one per change; don't invent a fourth:

| Trigger | Mechanism |
|---|---|
| User clicked / typed in the UI | Server Action *or* JSON API route |
| Server observed something external | Background job → DB write → `pf_map_event` insert → `pg_notify` → WS push |
| Cross-tab fan-out of either above | WebSocket server → client only |

The WebSocket is **broadcast-only**. Clients never mutate over it.

### Shared types
All domain types live in `src/types/index.ts`. Do not define project-domain types inline in components or services. DB-derived types use Drizzle's `InferSelectModel` / `InferInsertModel`.

### Code style
- Don't add features, refactor, or introduce abstractions beyond what the task requires
- Comments explain *why* (constraints, invariants, workarounds), never *what*
- Trust internal code; validate only at system boundaries
- No backwards-compatibility shims for legacy URL shapes, cookie formats, or DB columns (the one exception is the documented "Remember me" cookie migration window — SPEC §7)

---

## Git workflow

- Branch from `master`
- One stage per branch, named `stage-<N>-<short-slug>` (e.g. `stage-3-payload-contracts`)
- Sub-stages can be separate commits on the same branch, or separate PRs if review surface gets too large
- Squash-merge to `master` when the stage's "Done when" is verified
- Don't force-push to `master`; don't skip CI hooks

Commit messages should reference the stage number, e.g. `Stage 6: pf_map_event partitioning + pg_notify trigger`.

---

## Decision-making

The roadmap is not immutable, but it is the agreed sequence. If during execution a stage reveals that the roadmap (or SPEC) is wrong:

1. Stop coding
2. Open an issue describing what's wrong and what change is proposed
3. Update [docs/plans/rebuild-roadmap.md](docs/plans/rebuild-roadmap.md) and/or the relevant `docs/spec/` doc in a separate PR
4. Resume the stage against the updated plan

Don't carry undocumented deviations from the roadmap into a feature PR. The roadmap is the source of truth for what's in scope per stage; the SPEC is the source of truth for architecture.

---

## Open questions

[SPEC.md §11](docs/spec/SPEC.md#11-open-questions-before-commit) lists 11 open questions. Each is mapped to a specific stage in [docs/plans/rebuild-roadmap.md § Verification](docs/plans/rebuild-roadmap.md#verification). If you encounter one of them during your stage, resolve it as part of the stage and update SPEC.md to record the decision.

If you discover a *new* open question that wasn't anticipated, add it to SPEC.md §11 in the same PR that surfaces it. Don't leave undocumented forks.
