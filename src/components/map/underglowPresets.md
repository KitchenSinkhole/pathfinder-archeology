## underglowPresets.ts

**Purpose:** Client-side registry mapping a `systemNotification` kind to its `UnderglowConfig` (color/brightness/duration/speed) — keeps the wire lean (server sends `kind`, client owns the look).
**File:** `src/components/map/underglowPresets.ts`

---

### UNDERGLOW_PRESETS
`Record<SystemNotificationLoad['kind'], UnderglowConfig>`. Today: `killmail` → red, ~8s transient pulse. Future state-derived glows (rally point, unscanned signatures) get presets here too, with `durationMs: 0` (persistent until cleared) instead of a transient lifetime.

### Depends On
- `@/lib/realtime/protocol` (`SystemNotificationLoad`), `@/types` (`UnderglowConfig`).
