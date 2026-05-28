## WebhookForm

**Purpose:** Controlled form for creating or editing a single `ap_map_webhook` row in the Stage 16.4 admin webhook list.
**File:** `src/components/admin/WebhookForm.tsx`

### Props (discriminated union)

| Variant | Fields | Description |
|---|---|---|
| `mode: 'create'` | `mapId: string` | Renders the add-webhook card with channel / event / url / username inputs. Calls `adminCreateWebhook` on submit. |
| `mode: 'edit'` | `webhook: { id, channel, event, url, username }`, `onDone?: () => void` | Renders an inline edit form. Channel + event are read-only (immutable post-create); only `url` and `username` are editable. Calls `adminUpdateWebhook` on submit and invokes `onDone` on success so the parent can collapse the dialog/row. |

### Renders
Stacked form with shadcn `Input` / `Select` primitives:
- Create variant: 2-col grid (channel, event), URL input, username override input, submit button.
- Edit variant: read-only channel/event chips, URL input (autofocus), username override input, save + optional cancel buttons.

### Behaviour & Interactions
- URLs are trimmed; empty URLs are blocked client-side with a toast (`urlSchema` re-validates server-side).
- Username override is trimmed and converted to `undefined` so the action's nullable-optional schema clears the column when blank.
- After a successful create, the URL / username fields reset and the event selector returns to `'history'`; channel stays at `'discord'` (its only enum value today).
- After a successful update, `onDone?.()` is fired so the parent can close the edit affordance.
- Uses `useTransition` so the button shows a pending state and form submission is non-blocking.
- Errors from the Server Action surface via `sonner` toasts.

### Depends On
- `adminCreateWebhook` / `adminUpdateWebhook` — `@/app/(admin)/actions/webhooks`.
- `Button`, `Input`, `Select*` — `@/components/ui/*`.
- `sonner` — toast notifications.
