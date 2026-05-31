## SystemUnderglow

**Purpose:** Pure presentational pulsing glow rendered behind a `SystemNode` — the reusable visual half of the underglow primitive.
**File:** `src/components/map/SystemUnderglow.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| color | string | yes | Any CSS color (the glow hue). |
| brightness | number | yes | Peak intensity, 0..1 (drives opacity). |
| durationMs | number | yes | Part of `UnderglowConfig`; consumed by the store's expiry timer, not by this component. |
| speedMs | number | yes | One pulse-cycle duration. |

Props are exactly `UnderglowConfig`.

### Renders
An absolutely-positioned, blurred, `pointer-events-none` element behind the node (`-inset-1 -z-10`), animated by the `animate-underglow` utility (globals.css). Color/brightness/speed are passed as CSS custom properties (`--underglow-color/-brightness/-speed`) so a single keyframe serves every preset.

### Behaviour & Interactions
- Notification-agnostic — knows nothing about killmails/rally/sigs; the caller picks the config.
- The owning `SystemNode` must be `relative`. Restart-on-retrigger is handled by the caller keying this element with the store's `token`.

### Depends On
- `@/types` (`UnderglowConfig`); the `animate-underglow` keyframe/utility in `src/app/globals.css`.
