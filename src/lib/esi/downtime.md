## downtime.ts

**Purpose:** Decide whether a given instant falls inside CCP's daily ESI-downtime window, so the client can treat failures there as expected rather than real faults.
**File:** `src/lib/esi/downtime.ts`

Mirrors legacy `Lib\Config::inDownTimeRange` (SPEC §01). Window = `CCP_SSO_DOWNTIME` ± `CCP_SSO_DOWNTIME_WINDOW_MIN`, padded by `CCP_SSO_DOWNTIME_BUFFER_MIN` each side. All UTC.

---

### inDowntimeWindow(at?: Date): boolean
Returns true when `at` (default `now`) is within the padded downtime window. Uses circular minute-of-day distance so a window straddling midnight is handled. Downtime failures are excluded from breaker counting and surface as `EsiDowntimeError`.
