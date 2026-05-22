// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { db, pool } from '@/db/client';
import { apCharacter, apUser } from '@/db/schema';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { refreshAccessToken } from '@/lib/auth/eve-provider';
import { __resetEveKeySetForTest, verifyEveAccessToken } from '@/lib/auth/jwks';

const CHARACTER_ID = 90000001n;
const ORIGINAL_REFRESH = 'original-refresh-token';
const ROTATED_REFRESH = 'rotated-refresh-token';
const NEW_ACCESS = 'new-access-token';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('refresh-token rotation (real Postgres)', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: 'src/db/migrations' });
    await db.delete(apCharacter).where(eq(apCharacter.id, CHARACTER_ID));
    const [user] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    await db.insert(apCharacter).values({
      id: CHARACTER_ID,
      userId: user!.id,
      name: 'Test Pilot',
      ownerHash: 'owner-hash',
      esiRefreshToken: encryptToken(ORIGINAL_REFRESH),
      esiAccessToken: encryptToken('old-access-token'),
      esiAccessTokenExpires: new Date(Date.now() - 1000),
      esiScopes: ['publicData'],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await db.delete(apCharacter).where(eq(apCharacter.id, CHARACTER_ID));
    await pool.end();
  });

  it('persists the rotated refresh token to the DB before returning the new access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          access_token: NEW_ACCESS,
          refresh_token: ROTATED_REFRESH,
          expires_in: 1200,
        }),
      ),
    );

    const returned = await refreshAccessToken(CHARACTER_ID);

    // The function only resolves after the DB write completes, so by the time
    // we hold the new access token the rotated refresh token must already be
    // persisted — the footgun #2 invariant.
    const [row] = await db
      .select({
        refresh: apCharacter.esiRefreshToken,
        access: apCharacter.esiAccessToken,
        exp: apCharacter.esiAccessTokenExpires,
      })
      .from(apCharacter)
      .where(eq(apCharacter.id, CHARACTER_ID));

    expect(returned).toBe(NEW_ACCESS);
    expect(decryptToken(row!.refresh!)).toBe(ROTATED_REFRESH);
    expect(decryptToken(row!.access!)).toBe(NEW_ACCESS);
    expect(row!.exp!.getTime()).toBeGreaterThan(Date.now());
  });

  it('a subsequent refresh uses the rotated token, not the original', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = new URLSearchParams(init.body as string);
        seen.push(body.get('refresh_token') ?? '');
        return Response.json({
          access_token: NEW_ACCESS,
          refresh_token: ROTATED_REFRESH,
          expires_in: 1200,
        });
      }),
    );

    await refreshAccessToken(CHARACTER_ID);
    expect(seen).toEqual([ROTATED_REFRESH]);
  });
});

describe('JWK set refetch cap (footgun #3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetEveKeySetForTest();
  });

  it('refetches the JWK set at most once per cooldown window', async () => {
    const fetchMock = vi.fn(async () => Response.json({ keys: [] }));
    vi.stubGlobal('fetch', fetchMock);
    __resetEveKeySetForTest();

    // A token whose `kid` is absent from the (empty) key set forces a lookup.
    const token = `${b64url({ alg: 'RS256', kid: 'absent' })}.${b64url({ sub: 'x' })}.sig`;

    await expect(verifyEveAccessToken(token)).rejects.toBeTruthy();
    await expect(verifyEveAccessToken(token)).rejects.toBeTruthy();

    // Two unknown-kid verifies within the 10s cooldown → a single network fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
