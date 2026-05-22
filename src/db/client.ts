import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/lib/env';
import * as schema from './schema';

declare global {
  var __aperturePool: Pool | undefined;
}

export const pool =
  globalThis.__aperturePool ?? new Pool({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== 'production') {
  globalThis.__aperturePool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;
