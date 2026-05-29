## RunCsvIngestCard

**Purpose:** Client wrapper around `SetupCard` that owns the result-formatting closure for `setupRunCsvIngest`.
**File:** `src/components/setup/RunCsvIngestCard.tsx`

### Renders
A `SetupCard` configured to call `setupRunCsvIngest` and render the result as `"Enqueued job <jobId>."`.

### Notes
- Re-ingests the vendored wormhole CSVs only (statics/overrides/classes); does not touch the SDE zip. Distinct from `RunSdeIngestCard`, which runs the full SDE ingest.
- Server Components can't pass plain function props to client components, so the per-trigger `renderResult` closure lives in this client wrapper rather than the `/setup` page.
