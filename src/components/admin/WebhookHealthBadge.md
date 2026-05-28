## WebhookHealthBadge

**Purpose:** Compact status pill for a single `ap_map_webhook` row, rendered in the Stage 16.4 admin webhook list.
**File:** `src/components/admin/WebhookHealthBadge.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| lastStatus | number \| null | yes | HTTP status from the most recent dispatch attempt; null when never attempted. |
| consecutiveFailures | number | yes | Reset to 0 on any successful dispatch; non-zero means the webhook is currently failing. |
| lastError | string \| null | yes | Truncated error text from the last failure; surfaced in the badge's tooltip when failing. |

### Renders
A small pill in one of three states:
- **Failing** — red `bg-destructive/10` with an alert icon, displaying the failure count and the truncated `lastError` as the tooltip.
- **Untested** — neutral grey with `CircleDashed` icon. No dispatch has been attempted yet.
- **Healthy** — green `bg-emerald-500/10` with a check icon and the last HTTP status.

### Behaviour
Server-side renderable (no `'use client'`). State is derived purely from props; tooltips use the native `title` attribute to avoid pulling in a Tooltip primitive.
