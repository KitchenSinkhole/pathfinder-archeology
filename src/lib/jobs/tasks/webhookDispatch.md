## webhookDispatch.ts

**Purpose:** Stage 14 graphile-worker task that runs the Discord webhook dispatcher for a single `ap_map_event` row.
**File:** `src/lib/jobs/tasks/webhookDispatch.ts`

---

### webhookDispatch (JobModule, name `'webhook-dispatch'`)

Non-cron task — enqueued per event by `commitMapEvent` only when `ap_map_webhook` has at least one row for the map. The handler decodes the BigInt / Date strings from the payload and delegates to `runWebhookDispatch` from `src/lib/webhooks/dispatcher.ts`. Instrumented via `withInstrumentation`, so each call produces an `ap_job_run` row whose `notes` contains the `WebhookDispatchNotes` summary (`attempted` / `succeeded` / `failed` / `skipped`).

### WebhookDispatchPayload

JSON-serialisable job payload:
- `mapId` — base-10 `ap_map.id`.
- `eventId` — base-10 `ap_map_event.id`.
- `occurredAt` — ISO 8601 string of `ap_map_event.occurred_at`. Locates the right monthly partition without scanning all partitions.
