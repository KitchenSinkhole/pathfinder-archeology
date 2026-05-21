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

### Contributing

The rebuild proceeds through a fixed sequence of stages. See [CONTRIBUTING.md](CONTRIBUTING.md) and the roadmap at [`docs/plans/rebuild-roadmap.md`](docs/plans/rebuild-roadmap.md).

### Licence

[MIT](http://opensource.org/licenses/MIT)
