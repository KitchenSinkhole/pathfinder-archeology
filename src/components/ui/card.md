## card.tsx

**Purpose:** Surface container (shadcn `Card`) for grouped content; used for the maps-list empty state and future panels.
**File:** `src/components/ui/card.tsx`

### Exports
- `Card` — root surface. Props add `size?: "default" | "sm"`.
- `CardHeader` / `CardTitle` / `CardDescription` / `CardAction` — header region slots.
- `CardContent` — body.
- `CardFooter` — footer (muted, top-bordered).

### Notes
- Plain `div`-based; no client directive needed.
