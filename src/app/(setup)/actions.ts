'use server';

import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { db } from '@/db/client';
import {
  clearSetupCookie,
  readSetupCookie,
  setSetupCookie,
} from '@/lib/auth/setup-cookie';
import { env } from '@/lib/env';
import { jobModules } from '@/lib/jobs/registry';

/**
 * Stage 16.6 setup-wizard Server Actions. All gated except `setupUnlockAction`
 * itself: a request hitting any other action without a valid `ap_setup` cookie
 * returns `{ ok: false, error: 'Locked.' }`. The unlock check is constant-time
 * (`timingSafeEqual`) and the response is generic ("Invalid password") to
 * prevent enumeration.
 *
 * Cross-cuts:
 *   - Every gated action emits a `console.warn` with the client's
 *     `x-forwarded-for` (if proxied) and the action name so proxy + app logs
 *     can be correlated. No DB audit row — CLAUDE.md forbids parallel audit
 *     tables and `ap_map_event` is map-scoped.
 *   - Operator-only actions never touch `ap_map_event` and bypass realtime —
 *     the wizard isn't a map surface, it's an ops console.
 */

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function clientIpHint(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '-';
}

async function logAction(name: string, extra?: Record<string, unknown>): Promise<void> {
  const ip = await clientIpHint();
  console.warn(`[setup] action=${name} ip=${ip}${extra ? ` ${JSON.stringify(extra)}` : ''}`);
}

async function gate(): Promise<ActionResult> {
  const unlocked = await readSetupCookie();
  if (!unlocked) return { ok: false, error: 'Locked.' };
  return { ok: true };
}

const passwordSchema = z.string().min(1, 'Password is required.').max(1000);

/**
 * Unlocks the console when the submitted password matches `SETUP_PASSWORD`.
 * Refuses to run if `SETUP_PASSWORD` is empty — a deploy that forgot to set
 * the env var must not accidentally accept any password.
 */
export async function setupUnlockAction(password: string): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: 'Invalid password.' };

  if (!env.SETUP_PASSWORD) {
    await logAction('unlock-refused-no-env');
    return { ok: false, error: 'Setup wizard is disabled: SETUP_PASSWORD is not configured.' };
  }

  const submitted = Buffer.from(parsed.data);
  const expected = Buffer.from(env.SETUP_PASSWORD);
  // timingSafeEqual requires equal-length buffers; pad the shorter side so the
  // comparison itself is the only branch that decides the outcome.
  const len = Math.max(submitted.length, expected.length);
  const submittedPadded = Buffer.concat([submitted, Buffer.alloc(len - submitted.length)]);
  const expectedPadded = Buffer.concat([expected, Buffer.alloc(len - expected.length)]);
  const ok =
    submitted.length === expected.length &&
    timingSafeEqual(submittedPadded, expectedPadded);
  if (!ok) {
    await logAction('unlock-failed');
    return { ok: false, error: 'Invalid password.' };
  }

  await setSetupCookie();
  await logAction('unlock-ok');
  revalidatePath('/setup');
  return { ok: true };
}

/** Clear the unlock cookie. Always returns ok; deleting a missing cookie is a no-op. */
export async function setupLogoutAction(): Promise<ActionResult> {
  await clearSetupCookie();
  await logAction('logout');
  revalidatePath('/setup');
  return { ok: true };
}

interface MigrateResult {
  applied: number;
  tags: string[];
}

interface DrizzleJournalEntry {
  idx: number;
  when: number;
  tag: string;
}

async function readJournalTags(): Promise<DrizzleJournalEntry[]> {
  const journalPath = join(process.cwd(), 'src', 'db', 'migrations', 'meta', '_journal.json');
  const raw = await readFile(journalPath, 'utf8');
  const parsed = JSON.parse(raw) as { entries?: DrizzleJournalEntry[] };
  return (parsed.entries ?? []).sort((a, b) => a.idx - b.idx);
}

async function appliedWhens(): Promise<Set<number>> {
  try {
    const result = await db.execute<{ created_at: string | number | null }>(
      sql`SELECT created_at FROM drizzle.__drizzle_migrations`,
    );
    const out = new Set<number>();
    for (const row of result.rows) {
      const v = row.created_at;
      if (v === null) continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out.add(n);
    }
    return out;
  } catch {
    // Table doesn't exist yet — first migrate run on a fresh database.
    return new Set();
  }
}

/**
 * Run pending Drizzle migrations against the configured `DATABASE_URL`.
 * Idempotent: re-running with no pending work returns `{ applied: 0, tags: [] }`.
 * Detects pending entries by diffing the journal's `when` timestamps against
 * the `drizzle.__drizzle_migrations` table before invoking the migrator.
 */
export async function setupRunMigrations(): Promise<ActionResult<MigrateResult>> {
  const gated = await gate();
  if (!gated.ok) return gated;
  await logAction('run-migrations');

  try {
    const journal = await readJournalTags();
    const before = await appliedWhens();
    const pending = journal.filter((e) => !before.has(e.when));

    await migrate(db, { migrationsFolder: 'src/db/migrations' });

    return {
      ok: true,
      data: { applied: pending.length, tags: pending.map((e) => e.tag) },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Migrate failed.' };
  }
}

interface EnqueueResult {
  /** `graphile_worker.jobs.id` as a base-10 string. */
  jobId: string;
}

async function enqueueJob(taskName: string): Promise<EnqueueResult> {
  const result = await db.execute<{ id: string | number }>(
    sql`SELECT graphile_worker.add_job(${taskName}, '{}'::json) AS id`,
  );
  const id = result.rows[0]?.id;
  return { jobId: id === undefined || id === null ? '' : String(id) };
}

/** Enqueue the `sde-ingest` graphile-worker job. Returns the queued job id. */
export async function setupRunSdeIngest(): Promise<ActionResult<EnqueueResult>> {
  const gated = await gate();
  if (!gated.ok) return gated;
  await logAction('run-sde-ingest');

  try {
    return { ok: true, data: await enqueueJob('sde-ingest') };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Enqueue failed.' };
  }
}

const cronOnDemandSchema = z.object({ name: z.string().min(1).max(120) });

/**
 * Enqueue a named graphile-worker task on-demand. Validates `name` against the
 * `taskRegistry` so the wizard can't enqueue arbitrary strings — the queue
 * itself rejects unknown task names, but a typed gate produces a clearer
 * error and bounds the surface to the operator subset.
 */
export async function setupRunCronOnDemand(
  name: string,
): Promise<ActionResult<EnqueueResult>> {
  const gated = await gate();
  if (!gated.ok) return gated;

  const parsed = cronOnDemandSchema.safeParse({ name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const known = new Set(jobModules().map((m) => m.name));
  if (!known.has(parsed.data.name)) {
    return { ok: false, error: `Unknown task: ${parsed.data.name}` };
  }
  await logAction('run-cron-on-demand', { name: parsed.data.name });

  try {
    return { ok: true, data: await enqueueJob(parsed.data.name) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Enqueue failed.' };
  }
}
