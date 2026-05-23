/**
 * Client-safe mirrors of the `ap/*` pgEnum value lists. Importing the real
 * `pgEnum` from `@/db/schema` into a `'use client'` module would pull
 * `drizzle-orm/pg-core` into the browser bundle for no reason — this file is the
 * single source of truth on the client.
 *
 * Keep these arrays in sync with `src/db/schema/ap/enums.ts`. A drift would
 * surface as a `system_status` (or similar) value the inspector can't render;
 * the server-side Zod schemas in `protocol.ts` still gate the wire.
 */

export const SYSTEM_STATUSES = [
  'unknown',
  'friendly',
  'occupied',
  'hostile',
  'empty',
  'unscanned',
] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

export const CONNECTION_SCOPES = ['wh', 'stargate', 'jumpbridge', 'abyssal'] as const;
export type ConnectionScope = (typeof CONNECTION_SCOPES)[number];

export const WH_MASSES = ['fresh', 'reduced', 'critical'] as const;
export type WhMass = (typeof WH_MASSES)[number];

export const WH_JUMP_MASSES = ['s', 'm', 'l', 'xl'] as const;
export type WhJumpMass = (typeof WH_JUMP_MASSES)[number];
