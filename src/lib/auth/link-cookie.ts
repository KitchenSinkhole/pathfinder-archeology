import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

// "Add character" threads the current account's userId through the EVE OAuth
// round-trip out-of-band: a signed, httpOnly, short-TTL cookie. The jwt callback
// reads it on the OAuth return so the new character is linked to the existing
// `ap_user` instead of minting a fresh one. The HMAC signature (keyed on
// AUTH_SECRET) is what prevents a forged cookie from attaching a character to an
// arbitrary victim account.

const COOKIE_NAME = 'ap_link';
const TTL_S = 300; // 5 minutes — long enough for the SSO redirect, short enough to bound abuse.

function sign(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

/** Encode `{ userId, exp }` as `payloadB64url.sigB64url`. Exposed for tests. */
export function signLinkPayload(userId: number, nowS: number = Math.floor(Date.now() / 1000)): string {
  const payload = Buffer.from(JSON.stringify({ userId, exp: nowS + TTL_S })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Inverse of {@link signLinkPayload}: the `userId` if the token is valid and unexpired, else `null`. Exposed for tests. */
export function verifyLinkPayload(token: string, nowS: number = Math.floor(Date.now() / 1000)): number | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const { userId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof userId !== 'number' || typeof exp !== 'number') return null;
    if (nowS >= exp) return null;
    return userId;
  } catch {
    return null;
  }
}

/** Set the signed link cookie for the current account. Call from a Server Action. */
export async function setLinkCookie(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, signLinkPayload(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_S,
  });
}

/** Read + verify the link cookie, returning the linked `userId` or `null`. */
export async function readLinkUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? verifyLinkPayload(token) : null;
}

/** Delete the link cookie. Best-effort — swallows the error if the context can't mutate cookies. */
export async function clearLinkCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(COOKIE_NAME);
  } catch {
    // Not in a mutable-cookie context; the 5-minute TTL bounds the stale cookie.
  }
}
