## sheet.tsx

**Purpose:** Side-anchored overlay panel (shadcn `Sheet`) built on `@base-ui/react` Dialog; used for the character switcher and other slide-in chrome.
**File:** `src/components/ui/sheet.tsx`

### Exports
- `Sheet` — root (`Dialog.Root`); controls open state.
- `SheetTrigger` — opens the sheet.
- `SheetClose` — closes the sheet (also used for action rows that should dismiss it).
- `SheetPortal` / `SheetOverlay` — portal + backdrop.
- `SheetContent` — the panel. Props add `side?: "top"|"right"|"bottom"|"left"` (default `"right"`) and `showCloseButton?: boolean` (default `true`).
- `SheetHeader` / `SheetFooter` / `SheetTitle` / `SheetDescription` — layout/text slots.

### Notes
- Client component (`"use client"`). Animations driven by base-ui `data-starting-style`/`data-ending-style`.
