import type { PoolClient } from 'pg';
import { pool } from '@/db/client';

/**
 * The three `location-poll*` integration files all record their runs in
 * `ap_job_run` under the same `name = 'location-poll'`, read the latest such
 * row, and clean up by deleting every row with that name. Vitest runs the
 * files in parallel workers against one shared database, so without
 * serialization one file's cleanup wipes another file's rows mid-assertion and
 * `lastRun()` can read a row that belongs to a different file. A Postgres
 * session-level advisory lock on a shared key forces the three suites to run
 * one at a time; waiters block in `beforeAll` until the holder's `afterAll`
 * releases.
 *
 * Advisory locks are connection-scoped, so the lock is held on a dedicated
 * pooled client for the whole suite — lock and unlock must run on the same
 * client. Each file owns its own `pool` (separate worker), but advisory locks
 * are database-global, so the key still serializes across workers.
 */
const LOCATION_POLL_SUITE_LOCK_KEY = 0x10c00911;

let lockClient: PoolClient | undefined;

export async function acquireLocationPollSuiteLock(): Promise<void> {
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [LOCATION_POLL_SUITE_LOCK_KEY]);
}

export async function releaseLocationPollSuiteLock(): Promise<void> {
  if (!lockClient) return;
  await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCATION_POLL_SUITE_LOCK_KEY]);
  lockClient.release();
  lockClient = undefined;
}
