'use client';

import { setupRunMigrations } from '@/app/(setup)/actions';
import { SetupCard } from './SetupCard';

export function RunMigrationsCard() {
  return (
    <SetupCard
      title="Run pending migrations"
      description="Applies any Drizzle migrations not yet recorded in drizzle.__drizzle_migrations. Idempotent."
      buttonLabel="Run migrations"
      pendingLabel="Running…"
      action={setupRunMigrations}
      renderResult={(d) =>
        d.applied === 0 ? 'No pending migrations.' : `Applied ${d.applied}: ${d.tags.join(', ')}`
      }
      successMessage="Migrations complete."
    />
  );
}
