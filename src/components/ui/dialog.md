## Dialog

**Purpose:** Centered modal dialog primitive (shadcn-style API on `@base-ui/react/dialog`), companion to the slide-over `Sheet`.
**File:** `src/components/ui/dialog.tsx`

### Exports
`Dialog` (Root), `DialogTrigger`, `DialogClose`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.

### Renders
A backdrop + centered popup card (`max-w-md`) with fade/scale enter-exit transitions and an optional top-right close button.

### Behaviour & Interactions
- `Dialog` is controllable via base-ui's `open` / `onOpenChange`, or uncontrolled with `defaultOpen`.
- `DialogContent` takes `showCloseButton` (default `true`).
- Built on the same primitive as `Sheet`; prefer `Sheet` for side panels, `Dialog` for focused confirm/create flows.
