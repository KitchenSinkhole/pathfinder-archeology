import { runWebhookDispatch } from '@/lib/webhooks/dispatcher';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 14. graphile-worker task: dispatch one map event to every Discord
 * webhook configured for its map. Enqueued by `commitMapEvent` after the
 * `ap_map_event` row is inserted (only when the map has at least one
 * `ap_map_webhook` row — see the `EXISTS` short-circuit in mutations/core.ts).
 *
 * Payload encodes BigInt / Date as strings because the graphile-worker JSON
 * column cannot carry either natively.
 */

const NAME = 'webhook-dispatch';

export interface WebhookDispatchPayload {
  /** `ap_map.id` as a base-10 string. */
  mapId: string;
  /** `ap_map_event.id` as a base-10 string. */
  eventId: string;
  /** `ap_map_event.occurred_at` ISO 8601 string. Locates the right monthly partition. */
  occurredAt: string;
}

async function dispatch(payload: WebhookDispatchPayload) {
  return await runWebhookDispatch(
    BigInt(payload.mapId),
    BigInt(payload.eventId),
    new Date(payload.occurredAt),
  );
}

export const webhookDispatch: JobModule = {
  name: NAME,
  run: withInstrumentation<WebhookDispatchPayload>(NAME, dispatch),
};
