## admin-maps.test.ts

**Purpose:** Stage 16.2 acceptance gate. Drives the three admin map Server Actions end-to-end against a real Postgres and asserts: soft-delete flips `deleted_at` + emits one `map.delete`; restore clears `deleted_at` + emits one `map.restore`; purge hard-deletes the row and cascades its events; admin-only purge gate; manager scope leak; member/anon denial.

**File:** `tests/integration/admin-maps.test.ts`

### Run
`docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test admin-maps`

### Setup
- One `ap_user` (random pk), two corps (`CORP_A` with `ALLIANCE_A`, `CORP_B` standalone), four characters:
  - `ADMIN_ID` — `authzLevel='admin'` in corp A.
  - `MANAGER_A_ID` — `authzLevel='manager'` in corp A.
  - `MANAGER_B_ID` — `authzLevel='manager'` in corp B.
  - `MEMBER_A_ID` — default `authzLevel='member'` in corp A.
- Three maps re-created `beforeEach`: an active corp-A map, a soft-deleted corp-A map, an active corp-B map. The soft-delete is applied via a raw `UPDATE` so each test starts with the same state.

### Mocking
- `@/lib/auth` is mocked to `{ auth: vi.fn(async () => currentSession) }`; tests mutate `currentSession` to swap actors. Same idiom as `character-session.test.ts`.
- `next/cache.revalidatePath` is mocked to a no-op so the actions can call it without a Next bundler in scope.

### Covered cases
- `adminSoftDeleteMap`: success path, refusal on already-soft-deleted, manager scope leak (corp B → corp A), member denial.
- `adminRestoreMap`: success path, refusal on non-soft-deleted, manager scope leak.
- `adminPurgeMap`: success path (row gone + events cascaded), refusal on active map, refusal for manager (admin-only), member denial.
- Anonymous (`currentSession = null`) denial across all three actions.
