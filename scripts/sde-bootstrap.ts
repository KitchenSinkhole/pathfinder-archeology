import { pool } from '@/db/client';
import { runIngest } from '@/lib/sde/ingest';

async function main() {
  const started = Date.now();
  const result = await runIngest();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nSDE build ${result.build} ingested in ${seconds}s:`);
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table.padEnd(18)} ${count}`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('SDE bootstrap failed:', err);
    await pool.end();
    process.exit(1);
  });
