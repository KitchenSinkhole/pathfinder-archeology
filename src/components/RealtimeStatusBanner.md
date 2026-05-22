## RealtimeStatusBanner

**Purpose:** Degraded-mode banner — surfaces realtime connection trouble so the UI never silently renders stale state (SPEC §71 NFR / CLAUDE.md "Realtime").
**File:** `src/components/RealtimeStatusBanner.tsx`

### Renders
Nothing while `status === 'open'`. Otherwise an amber `role="status"` strip: "Connecting to live updates…" while `connecting`, or an out-of-date warning for `closed`/`degraded`.

### Depends On
- `useRealtime()` from `src/lib/realtime/useRealtime.tsx`.
