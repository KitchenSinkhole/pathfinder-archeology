# Aperture

#### Wormhole mapping tool for [EVE Online](https://www.eveonline.com)

Aperture is a ground-up rewrite of the legacy Pathfinder wormhole mapper, built on Next.js 16, TypeScript, Drizzle ORM, and Postgres.

> **Status:** Early development. The spec lives in [`docs/spec/`](docs/spec/). The legacy PHP codebase is preserved at the [`legacy-archive`](../../tree/legacy-archive) tag.

### Stack

- **Next.js 16** App Router · **React 19** · **TypeScript 5+**
- **Drizzle ORM** · **Postgres 18**
- **Auth.js v5** with EVE SSO
- **xyflow** map canvas · **shadcn/ui** · **Tiptap**
- **graphile-worker** background jobs · Postgres `LISTEN/NOTIFY` realtime

### Run locally

Requires Node 24+, pnpm 9+, and Docker.

```bash
pnpm install
docker compose up -d db   # Postgres 18 with pgcrypto + pg_partman
pnpm dev                  # http://localhost:3000
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

### Deployment

Required env vars (see [`.env.example`](.env.example) for the full list):

- `DATABASE_URL` — Postgres connection string.
- `AUTH_SECRET` — `openssl rand -base64 32`. Used by Auth.js and to sign internal short-TTL cookies (`ap_link`, `ap_setup`).
- `AUTH_EVE_CLIENT_ID` / `AUTH_EVE_CLIENT_SECRET` — EVE SSO OAuth2 credentials.
- `ESI_TOKEN_ENC_KEY` — 32 random bytes (base64). Encrypts ESI access/refresh tokens at rest.
- `SETUP_PASSWORD` — gates the `/setup` operator console. Pick a long random string; rotating it invalidates active unlock cookies.

The wizard at `/setup` deliberately bypasses EVE SSO so an operator can recover from a broken auth deploy. The floor under that bypass is an in-app `SETUP_PASSWORD` check that mints a signed, 4-hour `ap_setup` cookie. A deployment with `NODE_ENV=production` and an empty `SETUP_PASSWORD` fails fast at import.

**Defense in depth (optional).** Operators MAY front `/setup` with proxy-level auth (nginx Basic, Cloudflare Access, etc.); the app gate is the floor and the deployment is safe without it provided `SETUP_PASSWORD` is set. This is a deliberate deviation from the original SPEC §11 Q2 answer (which mandated proxy Basic) so the single-`docker compose up` deploy story doesn't require container-level proxy config.

### Contributing

The rebuild proceeds through a fixed sequence of stages. See [CONTRIBUTING.md](CONTRIBUTING.md) and the roadmap at [`docs/plans/rebuild-roadmap.md`](docs/plans/rebuild-roadmap.md).

### Licence

[MIT](http://opensource.org/licenses/MIT)
