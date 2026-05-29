## menu.tsx

**Purpose:** Minimal Base UI dropdown-menu wrapper (the parts the header Info menu needs).
**File:** `src/components/ui/menu.tsx`

`'use client'`. Thin wrappers over `@base-ui/react/menu`, matching the `data-slot` + styling conventions of `select.tsx`.

### Exports
- `Menu` — `MenuPrimitive.Root`.
- `MenuTrigger` — `MenuPrimitive.Trigger` (use the Base UI `render={…}` prop to project a `Button`).
- `MenuContent` — Portal + Positioner (`sideOffset={4}`, `align="end"`) + styled Popup.
- `MenuItem` — styled `MenuPrimitive.Item`; highlight + disabled states wired via `data-*` attributes.
