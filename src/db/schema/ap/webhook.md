## webhook.ts

**Purpose:** The `ap_map_webhook` table — one row per `(map, channel, event)` Discord webhook subscription. Read by the Stage 14 dispatcher; written by the (future Stage 16) admin UI.
**File:** `src/db/schema/ap/webhook.ts`

---

### apMapWebhook
`pgTable('ap_map_webhook', …)`:
- `id` — `bigserial` PK.
- `map_id` — `bigint`, FK to `ap_map.id` `ON DELETE CASCADE`. Deleting the map drops every subscription with it.
- `channel` — `ap_webhook_channel` enum, required. Stage 14 only allows `'discord'`.
- `event` — `ap_webhook_event` enum, required. `'history'` or `'rally'`.
- `url` — `text`, required. Discord webhook URL, stored plaintext.
- `username` — `text`, nullable. Optional Discord username override.
- `last_status` — `integer`, nullable. HTTP status of most recent dispatch.
- `last_error` — `text`, nullable. Truncated error message from the last failure.
- `last_attempted_at` — `timestamptz`, nullable.
- `consecutive_failures` — `integer`, default `0`. Reset to `0` on success; admin UI uses it to flag stuck webhooks.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

**Constraints:**
- `ap_map_webhook_map_channel_event_uq` — unique `(map_id, channel, event)`. At most one URL per map per channel per event class.
- `ap_map_webhook_map_id_idx` — btree on `(map_id)`. Backs `commitMapEvent`'s per-event `EXISTS` short-circuit.

**Lifecycle:** No `active` boolean per CLAUDE.md "lifecycle patterns" rule — disabling a webhook = deleting the row. Failure columns are observability only and never auto-disable on their own (deferred to the Stage 16 admin UI policy).
