## AdminDashboardPage

**Purpose:** Index page of the admin panel. Renders five scope-aware count cards as a snapshot at request time.
**File:** `src/app/(admin)/admin/page.tsx`

### Renders
A header with the current scope label ("global" for admin; "corp <id>" for manager) plus a responsive grid of five `StatCard`s:

- **Active maps** — `ap_map` where `deleted_at IS NULL` AND scope-match.
- **Soft-deleted maps** — `ap_map` where `deleted_at IS NOT NULL` AND scope-match.
- **Kicked characters** — `ap_character` where `status='kicked'` AND scope-match.
- **Banned characters** — `ap_character` where `status='banned'` AND scope-match.
- **Failing webhooks** — `ap_map_webhook` where `consecutive_failures > 0` AND the parent map matches scope.

### Behaviour & Interactions
- `auth()` then `adminVisibilityScope(session)`; `null` scope redirects to `/maps` (defence in depth — the layout already gated the route).
- Counts run in parallel with `Promise.all`. No realtime — the admin layout deliberately omits `RealtimeProvider`.
- **Scope filter shape:**
  - `global` → no extra `WHERE` clause.
  - `corp` for maps → `owner_corporation_id = $corp` OR `owner_alliance_id = $alliance` (when alliance known) OR `owner_character_id IN (SELECT id FROM ap_character WHERE corporation_id = $corp)`.
  - `corp` for characters → `corporation_id = $corp`.
  - `corp` for webhooks → `EXISTS (SELECT 1 FROM ap_map WHERE id = ap_map_webhook.map_id AND <map scope>)`.

### Depends On
- `auth` from `@/lib/auth`; `adminVisibilityScope`, `mapScopeFilterFor`, `characterScopeFilterFor` from `@/lib/auth/rights` (Stage 16.2 promoted the two scope helpers out of this file so the admin maps list can reuse them).
- Drizzle: `apMap`, `apCharacter`, `apMapWebhook` from `@/db/schema`.
