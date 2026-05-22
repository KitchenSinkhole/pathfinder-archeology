import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Defaults so `@/lib/env` (parsed at import time) and crypto work in tests.
    // A real `.env.local`/CI env overrides these via process.env.
    env: {
      ESI_TOKEN_ENC_KEY:
        process.env.ESI_TOKEN_ENC_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      AUTH_EVE_CLIENT_ID: process.env.AUTH_EVE_CLIENT_ID ?? 'test-client-id',
      AUTH_EVE_CLIENT_SECRET: process.env.AUTH_EVE_CLIENT_SECRET ?? 'test-client-secret',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'test-auth-secret',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
