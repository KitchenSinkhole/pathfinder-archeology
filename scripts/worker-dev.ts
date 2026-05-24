import { loadEnvConfig } from '@next/env';

// Match server.ts: load .env BEFORE any env-reading import (db, jobs, etc.).
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

async function main() {
  const { pool } = await import('@/db/client');
  const { startWorker, stopWorker } = await import('@/lib/jobs/runner');

  const runner = await startWorker();
  console.log('▲ graphile-worker started (standalone)');

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down…`);
    try {
      await stopWorker();
    } catch (err) {
      console.error('stopWorker failed:', err);
    }
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await runner.promise;
}

main().catch(async (err) => {
  console.error('worker-dev failed:', err);
  process.exit(1);
});
