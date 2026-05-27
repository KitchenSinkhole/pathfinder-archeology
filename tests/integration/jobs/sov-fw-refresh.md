## sov-fw-refresh.test.ts

**Purpose:** Real-Postgres integration coverage for the Stage 13 sovereignty/FW worker and map intel loader.
**File:** `tests/integration/jobs/sov-fw-refresh.test.ts`

---

### sov-fw-refresh
Mocks ESI, runs the instrumented job, asserts k-space sov/FW rows are upserted, WH/unknown ids are skipped, stale rows are deleted, and `ap_job_run.notes` records counts.

---

### intelForSystems
Seeds sov/FW rows and mocked third-party integrations, then asserts the map intel loader returns client-serialisable owner ids, CCP image URLs, zKillboard rows, EVE-Scout rows, and FW progress.
