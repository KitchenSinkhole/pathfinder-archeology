## Sparkline

**Purpose:** Minimal inline-SVG sparkline rendering a normalized polyline over a numeric series (Stage 17.7).
**File:** `src/components/stats/Sparkline.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| data | number[] | yes | Series values, oldest → newest |
| width | number | no | SVG width px (default 80) |
| height | number | no | SVG height px (default 20) |
| className | string | no | Forwarded to the `<svg>` (controls stroke colour via `currentColor`) |

### Renders
A single `<polyline stroke="currentColor">` scaled to the max value. Empty / single-point / all-zero series draw a flat baseline.

### Behaviour & Interactions
- No dependency, no state — pure render. Stroke colour inherits from text colour (`currentColor`).
- Decorative: `aria-hidden`; the numeric `total` column carries the accessible value.
