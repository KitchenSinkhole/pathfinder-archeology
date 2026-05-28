## RunCronCard

**Purpose:** Client wrapper around `SetupCard` for an on-demand enqueue of one named graphile-worker task.
**File:** `src/components/setup/RunCronCard.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| taskName | string | yes | Registered job module name (validated server-side against `jobModules()`). |

### Renders
A `SetupCard` configured to call `setupRunCronOnDemand(taskName)` and render the result as `"Job <jobId>."`.

### Notes
- `useCallback` binds the task name so the same callable instance is passed across renders.
- Server Components can't pass plain function props to client components, so the per-trigger `renderResult` closure lives in this client wrapper rather than the `/setup` page.
