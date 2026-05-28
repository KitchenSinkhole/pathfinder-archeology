## webhooks.ts (admin server actions)

**Purpose:** Stage 16.4 admin actions on `ap_map_webhook` rows. Five operations exposed at `/admin/maps/[mapId]/webhooks`: create, update, delete, reset failure counter, and test-fire. All gated by `isManagerOrAdmin` + per-map scope check via `mapScopeFilterFor`.
**File:** `src/app/(admin)/actions/webhooks.ts`

---

### adminCreateWebhook(input): Promise<ActionResult<{ id: string }>>
Insert a new webhook row. Input is `{ mapId, channel, event, url, username? }`. Zod-validates the URL and enum values. Surfaces the `ap_map_webhook_map_channel_event_uq` constraint as a friendly "already exists" error rather than the raw Postgres detail. Revalidates the per-map webhook page on success.

### adminUpdateWebhook(input): Promise<ActionResult>
Patch `url` and/or `username` on an existing row. Channel + event are immutable — to change those, delete and recreate. No-op when no patch keys are supplied. Revalidates the per-map webhook page.

### adminDeleteWebhook(id: string): Promise<ActionResult>
Hard-delete a row. CLAUDE.md "no `active` flag" rule applies — unsubscribing means removing the row.

### adminResetWebhookFailures(id: string): Promise<ActionResult>
Zero `consecutive_failures` and clear `last_error`. Deliberately does NOT touch `last_status` / `last_attempted_at` — those stay as the last actual delivery's facts so the next operator can still see what happened.

### adminTestWebhook(id: string): Promise<ActionResult>
Enqueues a synthetic `webhook-dispatch` job with payload `{ test: true, webhookId, sentAt }`. The job handler (`src/lib/jobs/tasks/webhookDispatch.ts`) routes that shape to `runTestWebhookDispatch` (`src/lib/webhooks/dispatcher.ts`), which posts a `[test]` Discord message and writes back to the same observability columns a real dispatch would touch. Returns once the job is enqueued — the actual POST happens on the next worker tick; operators see the result by reloading.

---

### Gating helpers (internal)
- `gateForMap(mapId)` — resolves session, asserts `isManagerOrAdmin`, then proves the map is within the actor's `adminVisibilityScope` via the shared `mapScopeFilterFor` SQL predicate. Returns the scope on success so callers don't re-resolve it.
- `gateForWebhook(webhookId)` — same path but joined through `ap_map_webhook` → `ap_map` so the scope check applies to the webhook's owning map.

### Depends on
- `auth` / `isManagerOrAdmin` / `adminVisibilityScope` / `mapScopeFilterFor` — `@/lib/auth/rights` (16.1).
- `apMap`, `apMapWebhook`, `apWebhookChannel`, `apWebhookEvent` — `@/db/schema`.
- `graphile_worker.add_job` (SQL helper) — same enqueue pattern as `src/lib/jobs/tracking.ts`.

### Notes
- No `ap_map_event` row is written for webhook config changes; webhook subscriptions are infrastructure, not map state. The audit gap is documented in the Stage 16 plan ("What is intentionally NOT in scope").
- Manager scope check returns `"Map not found."` / `"Webhook not found."` instead of `"Forbidden."` to avoid leaking the existence of out-of-scope rows.
