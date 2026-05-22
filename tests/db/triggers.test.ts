// @vitest-environment node
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db/client';
import { apMap, apMapEvent } from '@/db/schema';
import { env } from '@/lib/env';

/**
 * Stage 6 gate (roadmap): the AFTER INSERT trigger on `ap_map_event` must fire
 * `pg_notify('map:'||map_id, payload)` for every insert — the single hook the
 * realtime layer depends on. Gated behind RUN_DB_TESTS so the default offline
 * `pnpm test` lane skips it:
 *
 *   docker compose up -d && pnpm db:migrate && RUN_DB_TESTS=1 pnpm test
 */
const run = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!run)('ap_map_event pg_notify trigger', () => {
  let mapId: bigint;
  let listener: Client;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    const [m] = await db
      .insert(apMap)
      .values({ scope: 'wh', type: 'private', name: 'trigger-test-map' })
      .returning({ id: apMap.id });
    mapId = m!.id;

    listener = new Client({ connectionString: env.DATABASE_URL });
    await listener.connect();
    // Channel identifiers can't be parameterised; mapId is a DB-generated bigint.
    await listener.query(`LISTEN "map:${mapId}"`);
  });

  afterAll(async () => {
    await listener?.end();
    await db.delete(apMap).where(sql`${apMap.id} = ${mapId}`);
    await pool.end();
  });

  it('fires a notification on map:<map_id> carrying the payload', async () => {
    const received = new Promise<{ channel: string; payload: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no notification within 2s')), 2000);
      listener.once('notification', (msg) => {
        clearTimeout(timer);
        resolve({ channel: msg.channel, payload: msg.payload ?? '' });
      });
    });

    await db.insert(apMapEvent).values({
      mapId,
      occurredAt: new Date(),
      kind: 'system.added',
      payload: { systemId: 30000142 },
    });

    const note = await received;
    expect(note.channel).toBe(`map:${mapId}`);
    expect(JSON.parse(note.payload)).toMatchObject({ systemId: 30000142 });
  });

  it('falls back to {} when payload is null', async () => {
    const received = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no notification within 2s')), 2000);
      listener.once('notification', (msg) => {
        clearTimeout(timer);
        resolve(msg.payload ?? '');
      });
    });

    await db.insert(apMapEvent).values({
      mapId,
      occurredAt: new Date(),
      kind: 'map.update',
    });

    expect(await received).toBe('{}');
  });
});
