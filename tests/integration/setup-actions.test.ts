// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { runMigrations } from 'graphile-worker';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, pool } from '@/db/client';

/**
 * Stage 16.6 — setup wizard Server Actions (real Postgres).
 *
 * Covers:
 *   - `setupUnlockAction` with an empty `SETUP_PASSWORD` rejects (no
 *     accidental open-deploy).
 *   - `setupUnlockAction` with a wrong password returns `{ ok: false }` and
 *     does not mint a cookie.
 *   - All gated actions return `{ ok: false, error: 'Locked.' }` when the
 *     `ap_setup` cookie is absent.
 *   - `setupRunCronOnDemand('invalid-job-name')` is rejected.
 *   - `setupRunCronOnDemand('signature-reap')` enqueues exactly one row in
 *     `graphile_worker.jobs`.
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

// `vi.mock` is hoisted to the top of the file, so all factory closures must
// capture state via `vi.hoisted` rather than ordinary `let` bindings.
const state = vi.hoisted(() => ({
  unlocked: false,
  setupPassword: '',
  setCalls: 0,
  clearCalls: 0,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => null })),
}));
vi.mock('@/lib/auth/setup-cookie', () => ({
  setSetupCookie: async () => {
    state.setCalls += 1;
    state.unlocked = true;
  },
  clearSetupCookie: async () => {
    state.clearCalls += 1;
    state.unlocked = false;
  },
  readSetupCookie: async () => state.unlocked,
}));

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    ...actual,
    get env() {
      return { ...actual.env, SETUP_PASSWORD: state.setupPassword };
    },
  };
});

const {
  setupUnlockAction,
  setupLogoutAction,
  setupRunMigrations,
  setupRunSdeIngest,
  setupRunCronOnDemand,
} = await import('@/app/(setup)/actions');

async function jobCountByTask(taskName: string): Promise<number> {
  const rows = (
    await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count
            FROM graphile_worker._private_jobs j
            JOIN graphile_worker._private_tasks t ON t.id = j.task_id
            WHERE t.identifier = ${taskName}`,
    )
  ).rows;
  return Number(rows[0]?.count ?? 0);
}

describe.skipIf(!run)('Stage 16.6 — setup wizard Server Actions (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await runMigrations({ pgPool: pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    state.unlocked = false;
    state.setCalls = 0;
    state.clearCalls = 0;
    state.setupPassword = '';
    await db.execute(
      sql`DELETE FROM graphile_worker._private_jobs WHERE task_id IN (
            SELECT id FROM graphile_worker._private_tasks WHERE identifier IN ('signature-reap', 'sde-ingest')
          )`,
    );
  });

  describe('setupUnlockAction', () => {
    it('refuses to unlock when SETUP_PASSWORD is empty', async () => {
      state.setupPassword = '';
      const result = await setupUnlockAction('anything');
      expect(result.ok).toBe(false);
      expect(state.setCalls).toBe(0);
    });

    it('rejects a wrong password and does not set the cookie', async () => {
      state.setupPassword = 'correct-horse-battery-staple';
      const result = await setupUnlockAction('wrong-password');
      expect(result).toEqual({ ok: false, error: 'Invalid password.' });
      expect(state.setCalls).toBe(0);
    });

    it('rejects an empty submitted password', async () => {
      state.setupPassword = 'correct-horse-battery-staple';
      const result = await setupUnlockAction('');
      expect(result.ok).toBe(false);
      expect(state.setCalls).toBe(0);
    });

    it('accepts the correct password and mints the cookie', async () => {
      state.setupPassword = 'correct-horse-battery-staple';
      const result = await setupUnlockAction('correct-horse-battery-staple');
      expect(result.ok).toBe(true);
      expect(state.setCalls).toBe(1);
    });
  });

  describe('gated actions when locked', () => {
    it('setupRunMigrations returns Locked', async () => {
      const result = await setupRunMigrations();
      expect(result).toEqual({ ok: false, error: 'Locked.' });
    });

    it('setupRunSdeIngest returns Locked', async () => {
      const result = await setupRunSdeIngest();
      expect(result).toEqual({ ok: false, error: 'Locked.' });
    });

    it('setupRunCronOnDemand returns Locked', async () => {
      const result = await setupRunCronOnDemand('signature-reap');
      expect(result).toEqual({ ok: false, error: 'Locked.' });
    });
  });

  describe('setupRunCronOnDemand (unlocked)', () => {
    beforeEach(() => {
      state.unlocked = true;
    });

    it('rejects an unknown task name', async () => {
      const result = await setupRunCronOnDemand('invalid-job-name');
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error).toMatch(/unknown task/i);
      }
    });

    it('enqueues exactly one row for a known task', async () => {
      expect(await jobCountByTask('signature-reap')).toBe(0);
      const result = await setupRunCronOnDemand('signature-reap');
      expect(result.ok).toBe(true);
      if (result.ok === true) {
        expect(result.data.jobId).not.toBe('');
      }
      expect(await jobCountByTask('signature-reap')).toBe(1);
    });
  });

  describe('setupRunMigrations (unlocked)', () => {
    beforeEach(() => {
      state.unlocked = true;
    });

    it('is idempotent when no migrations are pending', async () => {
      const result = await setupRunMigrations();
      expect(result.ok).toBe(true);
      if (result.ok === true) {
        expect(result.data.applied).toBe(0);
        expect(result.data.tags).toEqual([]);
      }
    });
  });

  describe('setupLogoutAction', () => {
    it('clears the cookie even when called locked', async () => {
      const result = await setupLogoutAction();
      expect(result.ok).toBe(true);
      expect(state.clearCalls).toBe(1);
    });
  });
});
