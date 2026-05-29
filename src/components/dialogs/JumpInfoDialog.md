## JumpInfoDialog

**Purpose:** Static reference dialog for wormhole mass / lifetime / sig-strength and statics by source class.
**File:** `src/components/dialogs/JumpInfoDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controls dialog visibility |
| onOpenChange | (open: boolean) => void | yes | Open-state callback (owned by the parent menu) |

### Renders
Two sections inside a scrollable body:
- **Wormhole mass** — a table of every WH code with leads-to class, total mass, jump mass, lifetime, sig strength.
- **Statics by source class** — the same rows grouped by `sourceClass` (null → "Any (K162)", sorted last), each listing code → target class.

### Behaviour & Interactions
- Lazy-loads `fetchWormholeJumpInfo()` (`@/lib/reference/client`) on first open; shows a loading then empty/loaded state. The client helper memoises, so reopens don't re-fetch.
- Mass is formatted in kilotonnes (kg ÷ 1e6), lifetime in hours (min ÷ 60), sig strength as a percentage.

### Depends On
- `fetchWormholeJumpInfo` — `@/lib/reference/client`
- `WormholeJumpInfoRow` — `@/types`
- `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` — `@/components/ui/dialog`
