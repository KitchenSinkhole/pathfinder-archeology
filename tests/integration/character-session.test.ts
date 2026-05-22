// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { inArray } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apCharacter, apUser } from '@/db/schema';

// `@/lib/auth` pulls in next-auth, which only resolves inside the Next bundler.
// These helpers only touch the DB, so stub the auth import away.
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

const { assertCharacterOwnership, getAccountCharacters } = await import('@/lib/session');

const C_ACTIVE = 90000101n; // active, account A
const C_BANNED = 90000102n; // banned, account A
const C_OTHER = 90000103n; // active, account B

describe('character session helpers (real Postgres)', () => {
  let userA = 0;
  let userB = 0;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apCharacter).where(inArray(apCharacter.id, [C_ACTIVE, C_BANNED, C_OTHER]));
    const [a] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    const [b] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userA = a!.id;
    userB = b!.id;
    await db.insert(apCharacter).values([
      { id: C_ACTIVE, userId: userA, name: 'Alpha Pilot', ownerHash: 'h1', status: 'active' },
      { id: C_BANNED, userId: userA, name: 'Bravo Pilot', ownerHash: 'h2', status: 'banned' },
      { id: C_OTHER, userId: userB, name: 'Charlie Pilot', ownerHash: 'h3', status: 'active' },
    ]);
  });

  afterAll(async () => {
    await db.delete(apCharacter).where(inArray(apCharacter.id, [C_ACTIVE, C_BANNED, C_OTHER]));
    await pool.end();
  });

  it('grants ownership for an active character on the account', async () => {
    expect(await assertCharacterOwnership(C_ACTIVE, userA)).toBe(true);
  });

  it('denies a banned character even if owned', async () => {
    expect(await assertCharacterOwnership(C_BANNED, userA)).toBe(false);
  });

  it('denies a character belonging to another account', async () => {
    expect(await assertCharacterOwnership(C_OTHER, userA)).toBe(false);
  });

  it('lists every character on the account, ordered by name', async () => {
    const chars = await getAccountCharacters(userA);
    expect(chars.map((c) => c.id)).toEqual([C_ACTIVE.toString(), C_BANNED.toString()]);
    expect(chars.map((c) => c.name)).toEqual(['Alpha Pilot', 'Bravo Pilot']);
  });
});
