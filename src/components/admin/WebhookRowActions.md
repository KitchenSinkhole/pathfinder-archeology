## WebhookRowActions

**Purpose:** Per-row action cluster (test-fire, reset failures, edit, delete) for the Stage 16.4 webhook list.
**File:** `src/components/admin/WebhookRowActions.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| webhook | `{ id, channel, event, url, username, consecutiveFailures }` | yes | Row data — `consecutiveFailures > 0` is the only thing that gates the reset button visibility. |

### Renders
Inline horizontal button row with four affordances:
- **Test** (`Send` icon) — always present; calls `adminTestWebhook`.
- **Reset** (`RotateCcw` icon) — only when `consecutiveFailures > 0`; calls `adminResetWebhookFailures`.
- **Edit** (`Pencil` icon) — opens a `Dialog` wrapping `WebhookForm` in edit mode.
- **Delete** (`Trash2` icon) — opens a confirm `Dialog` and calls `adminDeleteWebhook`.

### Behaviour & Interactions
- Every action uses `useTransition` for non-blocking submit and a pending button state.
- The test-fire toast is intentionally instruction-shaped ("reload in a moment …") because the actual POST happens on the next graphile-worker tick — the row's health badge updates only on a fresh page load.
- Reset clears `consecutive_failures` + `last_error`; it does NOT touch `last_status` / `last_attempted_at` (those stay as historical facts).
- Edit dialog passes `onDone={() => setOpen(false)}` to `WebhookForm` so a successful save auto-closes.

### Depends On
- `adminTestWebhook` / `adminResetWebhookFailures` / `adminDeleteWebhook` — `@/app/(admin)/actions/webhooks`.
- `WebhookForm` — sibling component, edit mode.
- `Dialog*`, `Button` — `@/components/ui/*`.
- `sonner` — toasts.
