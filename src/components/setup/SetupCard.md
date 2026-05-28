## SetupCard

**Purpose:** Single-purpose card with description, action button, spinner, and result-readout. Used by the `/setup` page for each trigger (migrations, SDE ingest, on-demand cron).
**File:** `src/components/setup/SetupCard.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| title | string | yes | Card heading. |
| description | string | yes | Short explanation under the heading. |
| buttonLabel | string | yes | Idle label for the action button. |
| pendingLabel | string | no | Label while the action is in flight. Defaults to `"{buttonLabel}…"`. |
| action | () => Promise<ActionResult<T>> | yes | The Server Action to invoke on click. |
| renderResult | (data: T) => string | no | Maps a successful result's `data` to a one-line readout. |
| successMessage | string | no | Toast / readout prefix on success. Defaults to `"Done."`. |

### Renders
A shadcn `Card` with `CardHeader` (title + description), a `CardContent` with the button and an optional `<p data-slot="setup-card-result">` line showing the last outcome.

### Behaviour & Interactions
- Wraps `action()` in `useTransition`; the button is disabled while pending.
- Success: toast + readout reflect the rendered result (or the success message if no `renderResult` was supplied).
- Failure: toast + readout show the action's `error` string.
- The readout persists between clicks so the operator can see the last result without keeping the toast open.
