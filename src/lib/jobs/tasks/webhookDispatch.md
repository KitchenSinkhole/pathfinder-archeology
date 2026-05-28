## webhookDispatch.ts

**Purpose:** Stage 14 graphile-worker task that runs the Discord webhook dispatcher. Two payload shapes — event-driven (from `commitMapEvent`) and Stage 16.4 admin test-fire (single-webhook synthetic message).
**File:** `src/lib/jobs/tasks/webhookDispatch.ts`

---

### webhookDispatch (JobModule, name `'webhook-dispatch'`)

Non-cron task. Two enqueue paths share the same task name and `ap_job_run` history:

- **Event path** (`commitMapEvent`) — fires per `ap_map_event` insert when the map has at least one `ap_map_webhook` row. Handler decodes the BigInt/Date strings and delegates to `runWebhookDispatch`.
- **Test-fire path** (Stage 16.4 admin Server Action) — fires per operator click. Handler decodes the webhook id + sent-at and delegates to `runTestWebhookDispatch`, which sends a `[test]` Discord message and writes back to the same observability columns a real dispatch would touch.

Instrumented via `withInstrumentation`, so each call produces one `ap_job_run` row whose `notes` contains the `WebhookDispatchNotes` summary. The `test: true` flag in notes distinguishes test fires from real events when reading the job history.

### WebhookDispatchEventPayload

JSON-serialisable event-path payload:
- `mapId` — base-10 `ap_map.id`.
- `eventId` — base-10 `ap_map_event.id`.
- `occurredAt` — ISO 8601 string of `ap_map_event.occurred_at`. Locates the right monthly partition without scanning all partitions.

### WebhookDispatchTestPayload

JSON-serialisable test-fire payload:
- `test: true` — discriminator.
- `webhookId` — base-10 `ap_map_webhook.id` to target.
- `sentAt` — ISO 8601 string the operator clicked the button at; echoed into the rendered Discord message body so the operator can match cause and effect.

### WebhookDispatchPayload

Discriminated union of the two payload shapes above.
