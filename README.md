# Aperture

#### Wormhole mapping tool for [EVE Online](https://www.eveonline.com)

Aperture is a ground-up rewrite of the legacy Pathfinder wormhole mapper, built on Next.js 15, TypeScript, Drizzle ORM, and Postgres.

> **Status:** Early development. The spec lives in [`docs/spec/`](docs/spec/). The legacy PHP codebase is preserved at the [`legacy-archive`](../../tree/legacy-archive) tag.

### Stack

- **Next.js 15** App Router · **React 19** · **TypeScript 5**
- **Drizzle ORM** · **Postgres 16**
- **Auth.js v5** with EVE SSO
- **xyflow** map canvas · **shadcn/ui** · **Tiptap**
- **graphile-worker** background jobs · Postgres `LISTEN/NOTIFY` realtime

### Licence

[MIT](http://opensource.org/licenses/MIT)
