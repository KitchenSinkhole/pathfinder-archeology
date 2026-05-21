# Stage 0 — Project scaffold

**Goal:** A clean Next.js 16 + React 19 + TS 6 repo with Drizzle, Auth.js v5, shadcn/ui, sonner, Tiptap, xyflow, TanStack Table installed; `docker compose` brings up Postgres 18 with `pgcrypto` and `pg_partman`; `pnpm dev` boots an empty App Router page; `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest) all pass; CI runs the same.

**Spec references:**
- [docs/spec/SPEC.md §5 Target architecture](../spec/SPEC.md#5-target-architecture) — stack pin (Next 16 / React 19 / TS 6 / Drizzle / Postgres 18 / Auth.js v5 / Node 24 LTS; no Redis).
- [docs/spec/SPEC.md §5.5 Deployment topology](../spec/SPEC.md#55-deployment-topology) — single-compose Next + Postgres bundle.
- [docs/spec/SPEC.md §6.1 ORM, DB, and naming conventions](../spec/SPEC.md#61-orm-db-and-naming-conventions) — single Postgres schema; `pgcrypto` available.
- [docs/spec/SPEC.md §6.5 Lifecycle, visibility, and audit](../spec/SPEC.md#65-lifecycle-visibility-and-audit) — `pf_map_event` is partitioned monthly via `pg_partman` (extension must be available from Stage 0 onward).
- [docs/plans/rebuild-roadmap.md § Stage 0](rebuild-roadmap.md) — roadmap stub being expanded.
- [CLAUDE.md § Companion `.md` files](../../CLAUDE.md#companion-md-files--standing-instruction) — every `.ts`/`.tsx` gets a companion in the same edit.

---

## Sub-stage 0.1 — Workspace baseline
**Mode:** Accept edits
**Goal:** Bootable empty Next.js 16 App Router with TypeScript 6 typechecking.
**Touches:** `package.json`, `pnpm-workspace.yaml` (only if needed for engines pin), `tsconfig.json`, `next.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/layout.md`, `src/app/page.tsx`, `src/app/page.md`, `README.md`.
**Done when:** `pnpm install && pnpm dev` boots a page at `localhost:3000` rendering an `<h1>` heading; `pnpm typecheck` passes.

Details:
- `package.json` declares `"packageManager": "pnpm@9"`, `"engines": { "node": ">=24" }`, runtime deps `next@^16`, `react@^19`, `react-dom@^19`, dev deps `typescript@^6`, `@types/node`, `@types/react`, `@types/react-dom`. Scripts: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `test`, plus reserved `db:generate` / `db:migrate` stubs that error with "not yet wired" until Stage 1.
- `tsconfig.json` targets `ES2024`, `moduleResolution: "bundler"`, `jsx: "preserve"`, `paths: { "@/*": ["./src/*"] }`, `strict: true`, `noUncheckedIndexedAccess: true`.
- `next.config.ts` enables typed routes and lists `pg` and `graphile-worker` under `serverExternalPackages` so later stages don't need to revisit it.
- Replace legacy `.gitignore` with Next-flavored entries: `.next/`, `node_modules/`, `coverage/`, `.env`, `.env.*` (allow `.env.example`), `dist/`, `*.tsbuildinfo`, plus the existing OS clutter rules.
- `src/app/layout.tsx` is a minimal root layout (HTML/body shell, imports `globals.css` once Stage 0.4 adds it — Stage 0.1 leaves the import in a TODO comment).
- `src/app/page.tsx` renders a heading like "Aperture — scaffold ready".
- Update `README.md` so the "How to run" instructions reference `pnpm install` / `pnpm dev` (the current README is stale).

## Sub-stage 0.2 — Lint, format, test, CI
**Mode:** Accept edits
**Goal:** All four quality gates (`typecheck`, `lint`, `test`, build) pass locally and in GitHub Actions.
**Touches:** `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `tests/smoke.test.ts`, `tests/smoke.md`, `.github/workflows/ci.yml`.
**Done when:** `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass; CI green on a draft commit.

Details:
- ESLint 9 flat config extending `next/core-web-vitals` + `@typescript-eslint/recommended`. Adds `eslint-config-prettier` last to disable conflicting style rules.
- Prettier config sets `printWidth: 100`, `singleQuote: true`, `trailingComma: "all"`. `.prettierignore` excludes `.next`, `coverage`, `dist`, `pnpm-lock.yaml`.
- Vitest config sets `environment: 'jsdom'` (so future component tests run unchanged), `globals: true`, includes `tests/**/*.test.ts(x)`.
- `tests/smoke.test.ts` is one trivial assertion so `pnpm test` exits 0.
- CI workflow: triggers on `push` to `master` and on `pull_request`. Single Linux job:
  - `actions/checkout@v4`
  - `pnpm/action-setup@v4` with version 9
  - `actions/setup-node@v4` with Node 24 + `cache: 'pnpm'`
  - `pnpm install --frozen-lockfile`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `services.postgres` — built from `docker/postgres/Dockerfile` (added in 0.3) so future stages get a real DB in CI without revisiting the workflow. (GitHub Actions `services:` only supports prebuilt images, so we publish a `Dockerfile`-built image via a small `docker build` step at the top of the job rather than `services:`. Decision recorded here so 0.3 plans for it.)

## Sub-stage 0.3 — Docker Postgres 18 + extensions
**Mode:** Accept edits
**Goal:** `docker compose up -d db` produces a healthy Postgres 18 with `pgcrypto` and `pg_partman` extensions loaded.
**Touches:** `docker-compose.yml`, `docker/postgres/Dockerfile`, `docker/postgres/initdb/01-extensions.sql`, `.env.example`.
**Done when:** `docker compose up -d db` reports healthy and `docker compose exec db psql -U postgres -d aperture -c "SELECT extname FROM pg_extension ORDER BY extname;"` lists `pg_partman`, `pgcrypto`, `plpgsql`.

Details:
- `docker/postgres/Dockerfile`: `FROM postgres:18-bookworm`. Install `postgresql-18-partman` via `apt-get` (Debian package distributed by the PGDG repo that the official image already wires up). `pgcrypto` is in-tree on the official image, so no install needed.
- `docker/postgres/initdb/01-extensions.sql` runs on first boot only:
  - `CREATE SCHEMA IF NOT EXISTS partman;`
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
  - `CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;`
- `docker-compose.yml` defines one service `db` with `build: ./docker/postgres`, env `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=aperture`, port `5432:5432`, named volume `aperture_pgdata:/var/lib/postgresql/data`, healthcheck `pg_isready -U postgres -d aperture`.
- `.env.example` lists the env vars later stages will need. No real secrets — placeholders only:
  - `DATABASE_URL=postgres://postgres:postgres@localhost:5432/aperture`
  - `AUTH_SECRET=`
  - `AUTH_EVE_CLIENT_ID=`
  - `AUTH_EVE_CLIENT_SECRET=`
  - `EVE_USER_AGENT=Aperture/0.0.0 (contact@example.com)`
  - `ESI_TOKEN_ENC_KEY=` (32 random bytes, base64; used by Stage 2)

## Sub-stage 0.4 — Stack library installs + typed config
**Mode:** Accept edits
**Goal:** Every stack library named in SPEC §5 is installed so later stages can `import` without touching `package.json`. App constants live in a typed `aperture.config.ts`. Env vars are read through a Zod-validated `src/lib/env.ts`.
**Touches:** `package.json` (deps add), `components.json`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/lib/utils.ts`, `src/lib/utils.md`, `src/lib/env.ts`, `src/lib/env.md`, `aperture.config.ts`, `aperture.config.md`.
**Done when:** `pnpm typecheck` and `pnpm lint` still pass; `pnpm dev` page renders with Tailwind tokens applied (background/foreground colors).

Details:
- Runtime deps to install:
  - `drizzle-orm`, `pg`
  - `next-auth@beta` (Auth.js v5)
  - `@xyflow/react`
  - `@tanstack/react-table`
  - `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`
  - `sonner`
  - `zod`
  - `graphile-worker`
- Dev deps:
  - `drizzle-kit`
  - `@types/pg`
- `shadcn` CLI (via `pnpm dlx shadcn@latest init`) generates `components.json`, `src/lib/utils.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css` with design tokens. No components added — the init alone is the deliverable. (If `shadcn init` is non-interactive-unfriendly in this environment, the equivalent files are written by hand using the canonical shadcn defaults.)
- `aperture.config.ts` at repo root exports a single typed object. Stage 0 seeds only the constants the spec already nailed down — later stages add more as features land:
  - `LOCATION_POLL_ONLINE_MS`
  - `LOCATION_POLL_OFFLINE_MS`
  - `JWK_REFETCH_MIN_INTERVAL_MS = 10_000`
  - `CCP_SSO_DOWNTIME_WINDOW_MIN = 8`
  - `MAP_EVENT_NOTIFY_CHANNEL_PREFIX = 'map:'`
  - placeholder map limits (`MAX_MAPS_PER_SCOPE`, `MAX_SYSTEMS_PER_MAP`) initialized to spec defaults.
- `src/lib/env.ts` exports a typed `env` object built from `process.env` via Zod. Fails fast on boot if a required var is missing. Stage 0 covers `DATABASE_URL`, `AUTH_SECRET`, `AUTH_EVE_CLIENT_ID`, `AUTH_EVE_CLIENT_SECRET`, `EVE_USER_AGENT`, `ESI_TOKEN_ENC_KEY`. All are required, but `src/lib/env.ts` accepts empty strings during Stage 0 (with a `Stage-0 stub` note) so a fresh clone can `pnpm dev` without copying `.env.example` to `.env.local` — Stage 2 (Auth) flips these to required-non-empty.
- `src/app/layout.tsx` imports `./globals.css` for real now (the TODO from 0.1 resolves).

---

## Critical files
- Workspace: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`
- App entry: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Quality gates: `eslint.config.mjs`, `.prettierrc.json`, `vitest.config.ts`, `.github/workflows/ci.yml`
- DB: `docker-compose.yml`, `docker/postgres/Dockerfile`, `docker/postgres/initdb/01-extensions.sql`, `.env.example`
- Config + utils: `aperture.config.ts`, `src/lib/env.ts`, `src/lib/utils.ts`
- shadcn output: `components.json`, `tailwind.config.ts`, `postcss.config.mjs`
- Companion `.md` for every `.ts`/`.tsx` written above

## Reuse / patterns
- **shadcn/ui init** owns Tailwind config + `globals.css` + `lib/utils.ts`. Don't hand-roll any of those.
- **Drizzle Kit** owns DB migrations starting Stage 1. Stage 0 only installs it.
- **Companion `.md`** format: see [CLAUDE.md § Companion .md files](../../CLAUDE.md#companion-md-files--standing-instruction).
- **Three mutation pathways** in SPEC §5.1 are *not* touched in Stage 0 — no API routes, no Server Actions, no WS handlers.

## Verification (end of 0.4)
1. `pnpm install` resolves cleanly.
2. `pnpm typecheck` passes.
3. `pnpm lint` passes.
4. `pnpm test` passes (smoke test only).
5. `pnpm dev` serves `localhost:3000` with Tailwind tokens.
6. `docker compose up -d db` reports healthy.
7. `docker compose exec db psql -U postgres -d aperture -c "SELECT extname FROM pg_extension ORDER BY extname;"` lists `pg_partman`, `pgcrypto`, `plpgsql`.
8. CI workflow runs all four pnpm commands green on a draft commit.

Stage 0's roadmap "Done when" is satisfied when all eight pass.
