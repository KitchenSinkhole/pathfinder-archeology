## locationPollSuiteLock.ts

**Purpose:** Serialize the three `location-poll*` integration test files so their shared `ap_job_run` (`name = 'location-poll'`) reads, writes, and cleanup deletes don't race when Vitest runs the files in parallel against one database.
**File:** `tests/integration/jobs/locationPollSuiteLock.ts`

---

### acquireLocationPollSuiteLock(): Promise<void>
Checks out a dedicated client from the shared `pool` and takes a Postgres session-level `pg_advisory_lock` on a fixed key. The promise resolves only once the lock is granted, so a second file's `beforeAll` blocks here until the current holder releases. Call once at the top of `beforeAll`.

**Returns:** Resolves when the lock is held by this file.

---

### releaseLocationPollSuiteLock(): Promise<void>
Releases the advisory lock (on the same client that took it) and returns the client to the pool. No-op if the lock was never acquired. Call at the end of `afterAll`, before `pool.end()`.

**Returns:** Resolves when the lock is released and the client returned.
