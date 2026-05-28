## AdminMapWebhooksPage

**Purpose:** Stage 16.4 per-map webhook subscription editor. Lists `ap_map_webhook` rows for one map with health badges, per-row actions, and an add-webhook form.
**File:** `src/app/(admin)/admin/maps/[mapId]/webhooks/page.tsx`

### Route
`/admin/maps/[mapId]/webhooks` — sits inside the `(admin)` route group, inheriting the admin layout, header, and nav.

### Server-side gates
1. Parse `mapId` — `notFound()` on non-numeric.
2. `isManagerOrAdmin(session)` — redirect to `/maps` otherwise.
3. `adminVisibilityScope(session)` — redirect to `/maps` if null.
4. Existence + scope check on `ap_map`: `WHERE id = $mapId AND <mapScopeFilterFor(scope)>`. `notFound()` on miss — same wording as a non-existent map so out-of-scope managers can't enumerate maps from other corps.

### Data shape
Selects the full per-row observability surface from `ap_map_webhook`:
- `id` / `channel` / `event` / `url` / `username` — config.
- `lastStatus` / `lastError` / `lastAttemptedAt` / `consecutiveFailures` — health.

Rows are ordered `(event ASC, id ASC)` so a `history` row appears above a `rally` row and the ordering is stable across edits.

### Renders
- Header with "Back to maps" link, map name, and a small "Map id" code tag.
- Either a "no webhooks" empty state, or a table with columns: Event / Channel / URL (masked) / Health / Last attempt / actions.
- A `WebhookForm` in create mode below the table.

### URL masking
`maskUrl()` shows `host/…/<last 4 chars of the token>` so the full Discord webhook URL never appears on screen (operators can hover to see the `title=` tooltip with the full URL). Defends against shoulder-surfing during demos.

### Depends On
- `WebhookHealthBadge` — sibling component.
- `WebhookRowActions` — sibling component (client; renders test/reset/edit/delete buttons).
- `WebhookForm` — sibling component (client; create + edit modes).
- `apMap` / `apMapWebhook` — `@/db/schema`.
- `isManagerOrAdmin` / `adminVisibilityScope` / `mapScopeFilterFor` — `@/lib/auth/rights`.
