import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

async function main() {
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await pool.end();
    process.exit(1);
  });
