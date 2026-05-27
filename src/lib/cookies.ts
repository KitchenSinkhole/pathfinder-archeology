import { env } from '@/lib/env';

/**
 * Flags shared by every same-origin auth cookie this app sets.
 *
 * Closes SPEC §11 Q9 — Auth.js v5 picks reasonable defaults but doesn't make
 * the contract explicit at the call site. Centralising the flags here gives
 * the NextAuth `cookies:` block and the bespoke signed cookies (`link-cookie`,
 * future `setup-cookie`) one place to read from, so a flag change can never
 * silently diverge between surfaces.
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
} as const;
