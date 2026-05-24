import { loadEnvConfig } from '@next/env';

// Match server.ts: load .env BEFORE any env-reading import (db, jobs, etc.).
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

async function main() {
  const { pool } = await import('@/db/client');
  const { runWorkerOnce } = await import('@/lib/jobs/runner');

  await runWorkerOnce();
  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('worker-once failed:', err);
    process.exit(1);
  });
