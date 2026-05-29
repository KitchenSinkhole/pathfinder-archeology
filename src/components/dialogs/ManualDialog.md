## ManualDialog

**Purpose:** Static user guide with a section nav and scrollspy body.
**File:** `src/components/dialogs/ManualDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state (owned by `ReferenceMenu`). |
| onOpenChange | (open: boolean) => void | yes | Open-state setter. |

### Renders
A `max-w-3xl` dialog with a left section-nav (hidden below `sm`) and a scrollable body. Each `MANUAL_SECTIONS` entry renders as an anchored `<section id>` with a heading and paragraphs. Content is purely from the `MANUAL_SECTIONS` constant — no server call.

### Behaviour & Interactions
- Clicking a nav link smooth-scrolls its section into view and marks it active.
- An `IntersectionObserver` (rooted at the scroll container, `rootMargin` biased so the active section is the one near the top) updates the active nav link as the user scrolls.
- A `suppressUntil` timestamp ref blocks observer-driven active changes for ~500ms after a click so the programmatic scroll doesn't flicker the highlight through intermediate sections (mirrors the legacy "disable handler during programmatic scroll").
- The observer is created when `open` becomes true and disconnected on close/unmount, so reopening re-initialises cleanly with no duplicate observers.

### Depends On
- `@/components/ui/dialog`, `@/lib/utils` (`cn`)
- `MANUAL_SECTIONS` from `@/lib/reference/manual`
