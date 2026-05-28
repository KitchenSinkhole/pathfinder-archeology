import { z } from 'zod';

/**
 * System-boundary validation for `process.env`. Fails fast at import time.
 *
 * The SSO / crypto secrets are *required in production* (a deployment that
 * can authenticate must have them) but stay optional in dev/test so a fresh
 * clone can `pnpm dev`, run migrations, and run the test suite without a
 * `.env.local`. There is no dotenv loader in this repo — `next dev` injects
 * `.env.local`, while standalone `tsx` scripts inherit the shell env — so
 * hard-requiring these unconditionally would break `db:migrate` / Vitest.
 */
const schema = z
  .object({
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgres://postgres:postgres@localhost:5432/aperture'),
    AUTH_SECRET: z.string().default(''),
    AUTH_EVE_CLIENT_ID: z.string().default(''),
    AUTH_EVE_CLIENT_SECRET: z.string().default(''),
    AUTH_EVE_SSO_BASE: z.string().url().default('https://login.eveonline.com'),
    ESI_BASE_URL: z.string().url().default('https://esi.evetech.net'),
    EVE_USER_AGENT: z.string().default('Aperture/0.0.0 (contact@example.com)'),
    ESI_TOKEN_ENC_KEY: z.string().default(''),
    SETUP_PASSWORD: z.string().default(''),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== 'production') return;
    for (const key of ['AUTH_SECRET', 'AUTH_EVE_CLIENT_ID', 'AUTH_EVE_CLIENT_SECRET', 'ESI_TOKEN_ENC_KEY', 'SETUP_PASSWORD'] as const) {
      if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    }
  });

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
