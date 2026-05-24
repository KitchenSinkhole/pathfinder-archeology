import { createServer } from 'node:http';
import next from 'next';
import { loadEnvConfig } from '@next/env';

// Custom Node entry (SPEC §5.5): one process serves the Next.js app, the
// Auth.js routes, graphile-worker, and the WebSocket upgrade handler. Next 16's
// App Router cannot upgrade sockets inside a route handler, so the WS server is
// attached to the shared HTTP server here. All realtime logic lives in
// wsServer.ts / bus.ts — this file stays thin.

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3003);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

// CRITICAL: load .env / .env.local into process.env BEFORE any module that
// reads `@/lib/env` is evaluated. `tsx` has no dotenv loader, so without this
// the WS server would see AUTH_SECRET='' and reject every upgrade with 401. The
// env-reading modules (wsServer → env/db) are therefore imported dynamically,
// after this call, using the same loader Next itself uses so the AUTH_SECRET
// that decodes session cookies matches the app side.
loadEnvConfig(process.cwd(), dev);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const { attachWsServer } = await import('@/lib/realtime/wsServer');
  const { startWorker, stopWorker } = await import('@/lib/jobs/runner');

  const server = createServer((req, res) => {
    handle(req, res);
  });

  attachWsServer(server);

  server.listen(port, async () => {
    console.log(`▲ Aperture ready on http://${hostname}:${port} (ws ${dev ? 'dev' : 'prod'})`);
    try {
      await startWorker();
      console.log('▲ graphile-worker started');
    } catch (err) {
      console.error('graphile-worker boot failed:', err);
    }
  });

  // Stop the worker before letting the HTTP server close; graphile-worker
  // signals are disabled (runner.ts noHandleSignals) so we own shutdown.
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
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
