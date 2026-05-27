import { and, asc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { apertureConfig } from '../../../../aperture.config';
import { db } from '@/db/client';
import { apCharacter } from '@/db/schema';
import { syncCharacterAuthz } from '@/lib/auth/syncCharacterAuthz';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 15.6. Lands the legacy `cleanUpCharacterData` job deferred from
 * Stage 11. Single cron task with two responsibilities:
 *
 *   1. **Kick expiry.** Flip `status` from `'kicked'` back to `'active'` and
 *      `NULL` out `status_expires_at` / `status_reason` for every row where
 *      `status='kicked' AND status_expires_at <= now()`. Bans
 *      (`status='banned'`, `status_expires_at IS NULL`) are permanent and
 *      untouched.
 *
 *   2. **Periodic authz resync.** Re-run `syncCharacterAuthz` for every
 *      active character whose `authz_synced_at` is older than
 *      `CHARACTER_AUTHZ_RESYNC_STALE_AFTER_MS` (or NULL). Keeps the
 *      Director → admin promotion non-stale for characters who don't log
 *      in often. Bounded by `CHARACTER_AUTHZ_RESYNC_BATCH_SIZE` per tick;
 *      the next tick picks up the rest. ESI failures are tolerated row-by-row
 *      — `syncCharacterAuthz` returns `{ applied: false, skipped: ... }`
 *      without touching the DB so the cron keeps going.
 *
 * No `pg_notify` fan-out — the only state mutated is `ap_character`, which
 * the realtime bus doesn't subscribe to. Tabs see the demotion at next session
 * refresh.
 */

const NAME = 'character-cleanup';

interface CleanupNotes {
  kicksCleared: number;
  authzResynced: number;
  authzSkipped: number;
  authzScanned: number;
}

async function clearKickExpiries(): Promise<number> {
  const result = await db
    .update(apCharacter)
    .set({
      status: 'active',
      statusExpiresAt: null,
      statusReason: null,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(apCharacter.status, 'kicked'),
        isNotNull(apCharacter.statusExpiresAt),
        lte(apCharacter.statusExpiresAt, sql`now()`),
      ),
    )
    .returning({ id: apCharacter.id });
  return result.length;
}

async function resyncStaleAuthz(): Promise<{ scanned: number; applied: number; skipped: number }> {
  const cutoff = new Date(
    Date.now() - apertureConfig.CHARACTER_AUTHZ_RESYNC_STALE_AFTER_MS,
  );

  const candidates = await db
    .select({ id: apCharacter.id })
    .from(apCharacter)
    .where(
      and(
        eq(apCharacter.status, 'active'),
        isNotNull(apCharacter.esiRefreshToken),
        or(isNull(apCharacter.authzSyncedAt), lte(apCharacter.authzSyncedAt, cutoff)),
      ),
    )
    .orderBy(asc(apCharacter.authzSyncedAt))
    .limit(apertureConfig.CHARACTER_AUTHZ_RESYNC_BATCH_SIZE);

  let applied = 0;
  let skipped = 0;
  for (const row of candidates) {
    try {
      const result = await syncCharacterAuthz(row.id);
      if (result.applied) applied += 1;
      else skipped += 1;
    } catch {
      // Unexpected error from a single character must not abort the batch.
      // `syncCharacterAuthz` returns `{ applied: false }` on ESI failures;
      // anything reaching this catch is either a DB error or programmer bug.
      skipped += 1;
    }
  }

  return { scanned: candidates.length, applied, skipped };
}

async function cleanup(): Promise<CleanupNotes> {
  const kicksCleared = await clearKickExpiries();
  const resync = await resyncStaleAuthz();
  return {
    kicksCleared,
    authzResynced: resync.applied,
    authzSkipped: resync.skipped,
    authzScanned: resync.scanned,
  };
}

export const characterCleanup: JobModule = {
  name: NAME,
  cron: apertureConfig.CHARACTER_CLEANUP_CRON,
  run: withInstrumentation(NAME, cleanup),
};
