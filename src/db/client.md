## client.ts

**Purpose:** Singleton `pg` connection pool wired into Drizzle ORM with the full `universe_*` schema.
**File:** `src/db/client.ts`

---

### db
Drizzle client (`drizzle(pool, { schema })`) bound to the singleton pool and the complete schema from `./schema`. Use for all query-builder access.

### pool
The underlying `pg.Pool`. Reused across hot-reloads in non-production via `globalThis.__aperturePool` to avoid connection leaks. Read by `migrate.ts` to close cleanly after migrations.

### Database
`typeof db` — convenience type for passing the client around.

**Notes:** `DATABASE_URL` is read from the validated `@/lib/env`. `pg` is in `next.config.ts` `serverExternalPackages`.
