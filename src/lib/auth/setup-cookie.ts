import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_OPTIONS } from '@/lib/cookies';
import { env } from '@/lib/env';

// Stage 16.6 setup-wizard gate. The /setup route deliberately bypasses EVE SSO
// so an operator can troubleshoot a broken auth deploy; the floor under that
// bypass is a SETUP_PASSWORD check that mints this signed, httpOnly, short-TTL
// cookie. The HMAC signature (keyed on AUTH_SECRET) is what prevents a forged
// cookie from unlocking the console on a host that knows the secret.

const COOKIE_NAME = 'ap_setup';
const TTL_S = 4 * 60 * 60; // 4 hours — long enough for an ops session, short enough that a left-open tab self-locks.

function sign(payload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
}

/** Encode `{ exp }` as `payloadB64url.sigB64url`. Exposed for tests. */
export function signSetupPayload(nowS: number = Math.floor(Date.now() / 1000)): string {
  const payload = Buffer.from(JSON.stringify({ exp: nowS + TTL_S })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Inverse of {@link signSetupPayload}: `true` if the token is valid and unexpired, else `false`. Exposed for tests. */
export function verifySetupPayload(token: string, nowS: number = Math.floor(Date.now() / 1000)): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof exp !== 'number') return false;
    if (nowS >= exp) return false;
    return true;
  } catch {
    return false;
  }
}

/** Set the signed setup cookie. Call from a Server Action after a successful password check. */
export async function setSetupCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, signSetupPayload(), {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: TTL_S,
  });
}

/** Read + verify the setup cookie, returning `true` if the console is unlocked. */
export async function readSetupCookie(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? verifySetupPayload(token) : false;
}

/** Delete the setup cookie. Best-effort — swallows the error if the context can't mutate cookies. */
export async function clearSetupCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(COOKIE_NAME);
  } catch {
    // Not in a mutable-cookie context; the 4h TTL bounds the stale cookie.
  }
}
