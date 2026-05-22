// @vitest-environment node
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import { apMap, apMapEvent } from '@/db/schema';
import { commitMapEvent } from '@/lib/map/mutations/core';
import { mapEventPayloadSchema } from '@/lib/realtime/protocol';

/**
 * Stage 9.1 gate: `commitMapEvent` lands exactly ONE `ap_map_event` per call and
 * its payload parses against `mapEventPayloadSchema`. DB-gated like the rest:
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!run)('commitMapEvent (real Postgres)', () => {
  let mapId: bigint;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    const [m] = await db
      .insert(apMap)
      .values({ scope: 'wh', type: 'private', name: 'mutation-core-test' })
      .returning({ id: apMap.id });
    mapId = m!.id;
  });

  afterAll(async () => {
    await db.delete(apMap).where(eq(apMap.id, mapId));
    await pool.end();
  });

  it('writes exactly one event row and returns a payload that parses', async () => {
    const before = await eventCount(mapId);

    const result = await commitMapEvent({
      mapId,
      characterId: null,
      kind: 'map.update',
      mutate: async (tx, eventId) => {
        await tx.update(apMap).set({ name: 'renamed' }).where(eq(apMap.id, mapId));
        expect(eventId).toBeGreaterThan(0);
        return { id: mapId.toString(), name: 'renamed' };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => mapEventPayloadSchema.parse(result.data)).not.toThrow();
    expect(result.data).toMatchObject({ kind: 'map.update', eventId: result.eventId });

    expect(await eventCount(mapId)).toBe(before + 1);

    const [row] = await db
      .select({ id: apMapEvent.id, kind: apMapEvent.kind, payload: apMapEvent.payload })
      .from(apMapEvent)
      .where(eq(apMapEvent.id, BigInt(result.eventId)));
    expect(row!.kind).toBe('map.update');
    expect(row!.payload).toMatchObject({ kind: 'map.update', eventId: result.eventId });
  });

  it('rolls back (no event row) when the payload fails validation', async () => {
    const before = await eventCount(mapId);

    const result = await commitMapEvent({
      mapId,
      characterId: null,
      kind: 'map.update',
      // Force an invalid payload: `name` must be a string.
      mutate: async () => ({ id: mapId.toString(), name: 123 as unknown as string }),
    });

    expect(result.ok).toBe(false);
    expect(await eventCount(mapId)).toBe(before);
  });
});

async function eventCount(mapId: bigint): Promise<number> {
  const rows = (
    await db.execute(sql`SELECT count(*)::int AS count FROM ap_map_event WHERE map_id = ${mapId}`)
  ).rows as Array<{ count: number }>;
  return rows[0]!.count;
}
