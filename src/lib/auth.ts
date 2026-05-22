import NextAuth from 'next-auth';
import type {} from 'next-auth/jwt';
import { eq } from 'drizzle-orm';
import { apertureConfig } from '../../aperture.config';
import { db } from '@/db/client';
import { apCharacter, apUser } from '@/db/schema';
import { encryptToken } from '@/lib/crypto';
import { eveProvider, refreshAccessToken } from '@/lib/auth/eve-provider';
import type { EveProfile } from '@/lib/auth/eve-provider';

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
 * tokens. A newly-seen character gets its own `ap_user`; an existing character
 * keeps its `user_id` (multi-character linking is a Stage 5 flow). Returns the
 * resolved `userId`.
 */
async function persistLogin(
  profile: EveProfile,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
): Promise<number> {
  const [existing] = await db
    .select({ userId: apCharacter.userId })
    .from(apCharacter)
    .where(eq(apCharacter.id, profile.characterId));

  let userId = existing?.userId;
  if (userId === undefined) {
    const [user] = await db.insert(apUser).values({}).returning({ id: apUser.id });
    userId = user!.id;
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [eveProvider()],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in: `account` carries the freshly-exchanged tokens and
      // `profile` is the verified JWT-claims object from the provider.
      if (account && profile) {
        const eve = profile as unknown as EveProfile;
        const expiresAt = account.expires_at ?? Math.floor(Date.now() / 1000);
        const userId = await persistLogin(eve, {
          accessToken: account.access_token as string,
          refreshToken: account.refresh_token as string,
          expiresAt,
        });
        token.characterId = eve.characterId.toString();
        token.userId = userId;
        token.accessTokenExpiresAt = expiresAt;
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
