import type { OAuthConfig } from 'next-auth/providers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apertureConfig } from '../../../aperture.config';
import { db } from '@/db/client';
import { apCharacter } from '@/db/schema';
import { env } from '@/lib/env';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { verifyEveAccessToken, type EveAccessTokenClaims } from './jwks';

const ssoBase = () => env.AUTH_EVE_SSO_BASE;
const tokenUrl = () => new URL(apertureConfig.SSO_TOKEN_PATH, ssoBase()).toString();
const authorizeUrl = () => new URL(apertureConfig.SSO_AUTHORIZE_PATH, ssoBase()).toString();

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${env.AUTH_EVE_CLIENT_ID}:${env.AUTH_EVE_CLIENT_SECRET}`).toString('base64')}`;
}

// CCP's /v2/oauth/token response. Decoded with Zod so SSO drift is a hard error.
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export type EveProfile = EveAccessTokenClaims;

/**
 * Auth.js v5 custom EVE SSO provider. EVE issues a JWT access token and has no
 * userinfo endpoint, so the profile is derived from the verified access-token
 * claims (`jwks.ts`). SPEC §7.
 */
export function eveProvider(): OAuthConfig<EveProfile> {
  return {
    id: 'eve',
    name: 'EVE Online',
    type: 'oauth',
    clientId: env.AUTH_EVE_CLIENT_ID,
    clientSecret: env.AUTH_EVE_CLIENT_SECRET,
    checks: ['pkce', 'state'],
    authorization: {
      url: authorizeUrl(),
      params: { scope: apertureConfig.ESI_SCOPES.join(' ') },
    },
    token: tokenUrl(),
    userinfo: {
      // EVE has no userinfo endpoint — the profile is the verified JWT
      // access-token claims (`request` below). Auth.js still requires a `url`
      // here (its config assertion and the callback `as` builder both read
      // `userinfo.url`), so we point it at EVE's token-verify endpoint. It is
      // never actually fetched: when `request` is present @auth/core uses it in
      // preference to the URL.
      url: new URL('/oauth/verify', ssoBase()).toString(),
      async request({ tokens }: { tokens: { access_token?: string } }) {
        return verifyEveAccessToken(tokens.access_token ?? '');
      },
    },
    profile(profile) {
      return {
        id: profile.characterId.toString(),
        name: profile.name,
      };
    },
  } satisfies OAuthConfig<EveProfile>;
}

/**
 * Refresh a character's ESI access token, persisting the rotated refresh token
 * **before** returning the new access token to any caller.
 *
 * This ordering is the whole point of Stage 2 (SPEC §7, footgun #2): the legacy
 * app never persisted the rotated refresh token, so a crash between consuming
 * the new access token and writing the refresh token orphaned the character.
 * Here the DB write is awaited first; only then does the access token escape.
 *
 * @returns the freshly-issued access token (plaintext, for immediate use).
 */
export async function refreshAccessToken(characterId: bigint): Promise<string> {
  const [row] = await db
    .select({ esiRefreshToken: apCharacter.esiRefreshToken })
    .from(apCharacter)
    .where(eq(apCharacter.id, characterId));
  if (!row?.esiRefreshToken) {
    throw new Error(`No stored refresh token for character ${characterId}`);
  }
  const refreshToken = decryptToken(row.esiRefreshToken);

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: new URL(ssoBase()).host,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new Error(`EVE SSO token refresh failed: ${res.status} ${await res.text()}`);
  }
  const tokens = tokenResponseSchema.parse(await res.json());

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  // Persist the rotated refresh token (and the new access token) BEFORE the
  // access token is returned. Do not move the return above this await.
  await db
    .update(apCharacter)
    .set({
      esiRefreshToken: encryptToken(tokens.refresh_token),
      esiAccessToken: encryptToken(tokens.access_token),
      esiAccessTokenExpires: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(apCharacter.id, characterId));

  return tokens.access_token;
}
