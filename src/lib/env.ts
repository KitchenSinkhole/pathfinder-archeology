import { z } from 'zod';

/**
 * System-boundary validation for `process.env`. Fails fast at import time
 * if a required var is missing. Stage 0 accepts empty strings for SSO /
 * crypto keys so a fresh clone can `pnpm dev` without a `.env.local`;
 * Stage 2 (Auth) tightens those to `.min(1)`.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/aperture'),
  AUTH_SECRET: z.string().default(''),
  AUTH_EVE_CLIENT_ID: z.string().default(''),
  AUTH_EVE_CLIENT_SECRET: z.string().default(''),
  EVE_USER_AGENT: z.string().default('Aperture/0.0.0 (contact@example.com)'),
  ESI_TOKEN_ENC_KEY: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
