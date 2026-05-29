import NextAuth from 'next-auth';
import type {} from 'next-auth/jwt';
import { and, eq, isNull } from 'drizzle-orm';
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

/**
 * Resolve the character the session should land on — the account's "main"
 * (Stage 17.5). Every login lands on the main regardless of which character
 * actually SSO'd in; the human is one identity. On the first-ever login of an
 * account (or a pre-0018 account with no main yet) the authenticated character
 * is adopted as the main. A stored main that is no longer an active character
 * on the account falls back to the authenticated character.
 *
 * Implemented inline (not via `@/lib/session`) to avoid an import cycle —
 * `session.ts` already imports `auth` from here.
 */
async function resolveMainCharacter(
  userId: number,
  fallbackCharacterId: bigint,
): Promise<bigint> {
  const [user] = await db
    .select({ mainCharacterId: apUser.mainCharacterId })
    .from(apUser)
    .where(eq(apUser.id, userId));
  const stored = user?.mainCharacterId ?? null;
  if (stored == null) {
    // Bootstrap: guarded so concurrent first logins don't clobber each other.
    await db
      .update(apUser)
      .set({ mainCharacterId: fallbackCharacterId, updatedAt: new Date() })
      .where(and(eq(apUser.id, userId), isNull(apUser.mainCharacterId)));
    return fallbackCharacterId;
  }
  const [row] = await db
    .select({ id: apCharacter.id })
    .from(apCharacter)
    .where(
      and(
        eq(apCharacter.id, stored),
        eq(apCharacter.userId, userId),
        eq(apCharacter.status, 'active'),
      ),
    );
  return row ? stored : fallbackCharacterId;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    async jwt({ token, account, profile }) {
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
        // Land on the account's main, not necessarily the character that SSO'd
        // in (Stage 17.5). The "add character" flow therefore returns you to
        // your main after registering the new alt — consistent with the model.
        const mainCharacterId = await resolveMainCharacter(userId, eve.characterId);
        token.characterId = mainCharacterId.toString();
        token.userId = userId;
        // The main may differ from the just-authenticated character, so read its
        // own token expiry rather than reusing the freshly-exchanged one.
        if (mainCharacterId === eve.characterId) {
          token.accessTokenExpiresAt = expiresAt;
        } else {
          const [mainRow] = await db
            .select({ exp: apCharacter.esiAccessTokenExpires })
            .from(apCharacter)
            .where(eq(apCharacter.id, mainCharacterId));
          token.accessTokenExpiresAt = mainRow?.exp
            ? Math.floor(mainRow.exp.getTime() / 1000)
            : expiresAt;
        }
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
