## Resizable

**Purpose:** Thin shadcn/ui wrappers around `react-resizable-panels` v4 primitives — `Group`, `Panel`, `Separator`.
**File:** `src/components/ui/resizable.tsx`

### ResizablePanelGroup
Wraps `react-resizable-panels` `Group`. Applies `flex h-full w-full` and switches to `flex-col` via `aria-[orientation=vertical]:flex-col` when `orientation="vertical"` is passed. All `GroupProps` are forwarded, including `defaultLayout`, `onLayoutChanged`, and `orientation`.

### ResizablePanel
Wraps `react-resizable-panels` `Panel`. Forwards all `PanelProps` (`id`, `defaultSize`, `minSize`, `className`, etc.).

### ResizableHandle
Wraps `react-resizable-panels` `Separator`. Accepts an optional `withHandle` boolean — when true, renders a visible grip indicator. Used as the drag target between adjacent panels.
