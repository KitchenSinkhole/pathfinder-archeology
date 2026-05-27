## dispatcher.ts

**Purpose:** Stage 14 single-event Discord webhook dispatcher. Loads one `ap_map_event` row, joins to resolve naming context, fans out to every `ap_map_webhook` row that subscribes to the event class, and writes per-row delivery outcomes back to `ap_map_webhook`. Never throws.
**File:** `src/lib/webhooks/dispatcher.ts`

---

### runWebhookDispatch(mapId: bigint, eventId: bigint, occurredAt: Date): Promise<WebhookDispatchNotes>
Single-event dispatch. Called by the `webhook-dispatch` graphile-worker task with the event coordinates committed by `commitMapEvent`.

**Parameters:**
- `mapId` — the map's `ap_map.id`.
- `eventId` — the event's `ap_map_event.id`.
- `occurredAt` — the event's `ap_map_event.occurred_at`. Passed through to hit the right monthly partition without scanning the whole `ap_map_event` table.

**Returns:** Summary used by `withInstrumentation` to populate `ap_job_run.notes`:
- `attempted` — webhook deliveries actually POSTed.
- `succeeded` / `failed` — per-row outcomes (counted independently of HTTP status semantics).
- `skipped` — configured webhooks whose formatter returned `null` (position-only updates, signature deletes, …).
- `missingEvent` — `true` only when the event row could not be found at dispatch time (event was purged or never existed).

**Behaviour:**
- Validates the event payload against `mapEventPayloadSchema`; malformed payloads end with zeroed counts (defensive — `commitMapEvent` already validates on insert).
- Resolves `WebhookEventContext` once for the event (map name + character name + system / endpoint names) via a small set of joins; reused by every per-webhook formatter call.
- Rally webhooks only fire when `isRallySetEvent(event)` is true (rally-clear and other system updates flow to `history` only).
- On success: stamps `last_status`, clears `last_error`, sets `last_attempted_at`, resets `consecutive_failures` to 0.
- On failure: stamps `last_status`/`last_error`/`last_attempted_at`, increments `consecutive_failures`. Never throws (graphile-worker would re-deliver to webhooks that already succeeded, causing duplicates).

---

### Types

- `WebhookDispatchNotes` — return shape; mirrors what `ap_job_run.notes` stores.

### Constants

- `LAST_ERROR_MAX` (500) — `last_error` text is truncated to this many characters before storing.
