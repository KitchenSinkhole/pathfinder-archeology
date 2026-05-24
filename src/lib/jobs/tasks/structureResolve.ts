import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 11.6 STUB. The structure-intel module and its `ap_structure` data
 * model land in Stage 17; until then there is nothing to resolve. This task
 * exists only so the cron entry and the `ap_job_run` history are stable from
 * the start of Phase 3 — Stage 17 replaces the handler body without changing
 * the task name, cron, or registry shape.
 *
 * The handler is a deliberate no-op that returns a marker into
 * `ap_job_run.notes` so the operability page / CLI never reports "never ran"
 * for this task during the Stage-11 soak.
 *
 * Do NOT add work here without first delivering the `ap_structure` data model
 * — the contract is "deferred until Stage 17 ships the table".
 */

const NAME = 'structure-resolve';

async function resolve(): Promise<{ deferred: 'stage-17' }> {
  // TODO(stage-17): resolve stale ap_structure rows via ESI getUniverseStructure.
  return { deferred: 'stage-17' };
}

export const structureResolve: JobModule = {
  name: NAME,
  cron: '0 */6 * * *',
  run: withInstrumentation(NAME, resolve),
};
