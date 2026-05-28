import { runTestWebhookDispatch, runWebhookDispatch } from '@/lib/webhooks/dispatcher';
import { withInstrumentation } from '../withInstrumentation';
import type { JobModule } from '../registry';

/**
 * Stage 14. graphile-worker task: dispatch one map event to every Discord
 * webhook configured for its map. Enqueued by `commitMapEvent` after the
 * `ap_map_event` row is inserted (only when the map has at least one
 * `ap_map_webhook` row — see the `EXISTS` short-circuit in mutations/core.ts).
 *
 * Stage 16.4 adds a second payload shape — `{ test: true; webhookId; sentAt }`
 * — enqueued by the admin panel's "test fire" button. It exercises the same
 * dispatcher chain (so `last_status` lights up identically) but targets a
 * single webhook with a synthetic `[test]` message and skips the event-row
 * lookup. Both shapes share the `'webhook-dispatch'` task name so
 * graphile-worker observability stays one row in `ap_job_run`.
 *
 * Payload encodes BigInt / Date as strings because the graphile-worker JSON
 * column cannot carry either natively.
 */

const NAME = 'webhook-dispatch';

export interface WebhookDispatchEventPayload {
  /** `ap_map.id` as a base-10 string. */
  mapId: string;
  /** `ap_map_event.id` as a base-10 string. */
  eventId: string;
  /** `ap_map_event.occurred_at` ISO 8601 string. Locates the right monthly partition. */
  occurredAt: string;
}

export interface WebhookDispatchTestPayload {
  test: true;
  /** `ap_map_webhook.id` as a base-10 string. */
  webhookId: string;
  /** ISO 8601 string the operator clicked the button at; echoed into the test message body. */
  sentAt: string;
}

export type WebhookDispatchPayload =
  | WebhookDispatchEventPayload
  | WebhookDispatchTestPayload;

function isTestPayload(payload: WebhookDispatchPayload): payload is WebhookDispatchTestPayload {
  return (payload as WebhookDispatchTestPayload).test === true;
}

async function dispatch(payload: WebhookDispatchPayload) {
  if (isTestPayload(payload)) {
    return await runTestWebhookDispatch(BigInt(payload.webhookId), new Date(payload.sentAt));
  }
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
