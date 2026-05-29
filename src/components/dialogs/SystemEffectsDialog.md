## SystemEffectsDialog

**Purpose:** Static reference dialog listing every W-space anomaly effect and its per-class bonuses.
**File:** `src/components/dialogs/SystemEffectsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controls dialog visibility |
| onOpenChange | (open: boolean) => void | yes | Open-state callback (owned by the parent menu) |

### Renders
A scrollable two-up grid of tables, one per effect (Magnetar, Pulsar, …). Each table: rows = bonus types, columns = the classes the effect occurs in (labelled via `EFFECT_CLASS_LABELS`), cells = the bonus value.

### Behaviour & Interactions
- Pure reference render from `SYSTEM_EFFECTS` (`src/lib/eve/systemEffects.ts`); no server call, no local state.
- Bonus labels come from the first class entry and cells are read by index (all classes of an effect share the same ordered bonus list).

### Depends On
- `SYSTEM_EFFECTS`, `EFFECT_CLASS_LABELS` — `@/lib/eve/systemEffects`
- `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` — `@/components/ui/dialog`
