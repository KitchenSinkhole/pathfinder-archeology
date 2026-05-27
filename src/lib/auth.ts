import NextAuth from 'next-auth';
import type {} from 'next-auth/jwt';
import { and, eq } from 'drizzle-orm';
import { apertureConfig } from '../../aperture.config';
import { db } from '@/db/client';
import { apCharacter, apUser } from '@/db/schema';
import { encryptToken } from '@/lib/crypto';
import { eveProvider, refreshAccessToken } from '@/lib/auth/eve-provider';
import type { EveProfile } from '@/lib/auth/eve-provider';
import { clearLinkCookie, readLinkUserId } from '@/lib/auth/link-cookie';
import { syncCharacterAuthz } from '@/lib/auth/syncCharacterAuthz';
import { AUTH_COOKIE_OPTIONS } from '@/lib/cookies';

// Auth.js v5, stateless JWT sessions (no DB session store, no Redis — SPEC §7).
// The JWT carries only the active character/user ids; ESI tokens never leave
// the DB row.

declare module 'next-auth' {
  interface Session {
    characterId: string;
    userId: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    characterId?: string;
    userId?: number;
    accessTokenExpiresAt?: number; // epoch seconds
  }
}

/**
 * Upsert the user + character on initial sign-in and store the (encrypted) ESI
 * tokens. Resolution of the owning `ap_user`:
 * - An already-seen character keeps its existing `user_id` (a character is never
 *   re-homed between accounts, even during an "Add character" flow).
 * - An unseen character with a valid `linkUserId` (the "Add character" flow) is
 *   attached to that account.
 * - Otherwise a fresh `ap_user` is minted.
 * Returns the resolved `userId`.
 */
async function persistLogin(
  profile: EveProfile,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
  linkUserId?: number | null,
): Promise<number> {
  const [existing] = await db
    .select({ userId: apCharacter.userId })
    .from(apCharacter)
    .where(eq(apCharacter.id, profile.characterId));

  let userId = existing?.userId;
  if (userId === undefined) {
    if (linkUserId != null) {
      userId = linkUserId;
    } else {
      const [user] = await db.insert(apUser).values({}).returning({ id: apUser.id });
      userId = user!.id;
    }
  }

  const values = {
    id: profile.characterId,
    userId,
    name: profile.name,
    ownerHash: profile.ownerHash,
    esiAccessToken: encryptToken(tokens.accessToken),
    esiRefreshToken: encryptToken(tokens.refreshToken),
    esiAccessTokenExpires: new Date(tokens.expiresAt * 1000),
    esiScopes: profile.scopes,
    updatedAt: new Date(),
  };
  await db
    .insert(apCharacter)
    .values(values)
    .onConflictDoUpdate({ target: apCharacter.id, set: values });

  return userId;
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  providers: [eveProvider()],
  session: { strategy: 'jwt' },
  // SPEC §11 Q9 — make the cookie contract explicit at the call site rather
  // than relying on Auth.js defaults. Flags live in `@/lib/cookies` so any
  // bespoke signed cookie can read from the same constant.
  cookies: {
    sessionToken: { options: AUTH_COOKIE_OPTIONS },
    callbackUrl: { options: AUTH_COOKIE_OPTIONS },
    csrfToken: { options: AUTH_COOKIE_OPTIONS },
  },
  callbacks: {
    async jwt({ token, account, profile, trigger, session }) {
      // Initial sign-in: `account` carries the freshly-exchanged tokens and
      // `profile` is the verified JWT-claims object from the provider.
      if (account && profile) {
        const eve = profile as unknown as EveProfile;
        const expiresAt = account.expires_at ?? Math.floor(Date.now() / 1000);
        // "Add character" flow: a signed cookie carries the account to link the
        // new character onto. Absent/forged/expired → fresh-account behavior.
        const linkUserId = await readLinkUserId();
        const userId = await persistLogin(
          eve,
          {
            accessToken: account.access_token as string,
            refreshToken: account.refresh_token as string,
            expiresAt,
          },
          linkUserId,
        );
        await clearLinkCookie();
        token.characterId = eve.characterId.toString();
        token.userId = userId;
        token.accessTokenExpiresAt = expiresAt;
        // Stage 15. Promote / demote authz, refresh affiliation, mirror corp
        // titles. Best-effort: ESI failure logs a warning but does not block
        // login — the user can still see the maps they already had access to.
        try {
          await syncCharacterAuthz(eve.characterId);
        } catch (err) {
          console.warn(
            `[auth] syncCharacterAuthz failed for character ${eve.characterId}:`,
            err,
          );
        }
        return token;
      }

      // Character switch (Server Action → `unstable_update`): re-point the token
      // at another character on the same account. Re-validate ownership here as
      // defense in depth — the JWT is the trust boundary.
      if (trigger === 'update' && session && typeof session === 'object' && 'characterId' in session) {
        const target = (session as { characterId?: string }).characterId;
        if (target && token.userId != null) {
          const [row] = await db
            .select({ exp: apCharacter.esiAccessTokenExpires })
            .from(apCharacter)
            .where(
              and(
                eq(apCharacter.id, BigInt(target)),
                eq(apCharacter.userId, token.userId),
                eq(apCharacter.status, 'active'),
              ),
            );
          if (row) {
            token.characterId = target;
            token.accessTokenExpiresAt = row.exp ? Math.floor(row.exp.getTime() / 1000) : 0;
          }
        }
        return token;
      }

      // Subsequent calls: rotate the access token as it nears expiry. The
      // rotation persists the new refresh token before returning (footgun #2).
      if (token.characterId && token.accessTokenExpiresAt) {
        const buffer = apertureConfig.SSO_TOKEN_REFRESH_BUFFER_S;
        if (Math.floor(Date.now() / 1000) >= token.accessTokenExpiresAt - buffer) {
          try {
            await refreshAccessToken(BigInt(token.characterId));
            const [row] = await db
              .select({ exp: apCharacter.esiAccessTokenExpires })
              .from(apCharacter)
              .where(eq(apCharacter.id, BigInt(token.characterId)));
            if (row?.exp) token.accessTokenExpiresAt = Math.floor(row.exp.getTime() / 1000);
          } catch {
            // Refresh failed (revoked token / CCP downtime). Leave the token as
            // is; downstream callers treat a stale character as logged-out.
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        characterId: token.characterId ?? '',
        userId: token.userId ?? 0,
      };
    },
  },
});
