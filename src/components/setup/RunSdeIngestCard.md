## RunSdeIngestCard

**Purpose:** Client wrapper around `SetupCard` that owns the result-formatting closure for `setupRunSdeIngest`.
**File:** `src/components/setup/RunSdeIngestCard.tsx`

### Renders
A `SetupCard` configured to call `setupRunSdeIngest` and render the result as `"Enqueued job <jobId>."`.

### Notes
- Server Components can't pass plain function props to client components, so the per-trigger `renderResult` closure lives in this client wrapper rather than the `/setup` page.
