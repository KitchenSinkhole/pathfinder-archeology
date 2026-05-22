## migrate.ts

**Purpose:** CLI runner that applies pending Drizzle migrations against the configured Postgres, then exits.
**File:** `src/db/migrate.ts`

---

### main()
Runs `migrate(db, { migrationsFolder: 'src/db/migrations' })`. Invoked via `pnpm db:migrate` (`tsx src/db/migrate.ts`). Closes the pool and exits `0` on success, logs the error and exits non-zero on failure.
