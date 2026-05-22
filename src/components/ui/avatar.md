## avatar.tsx

**Purpose:** Image avatar with fallback (shadcn `Avatar`) built on `@base-ui/react` Avatar; used for EVE character portraits in the header and switcher.
**File:** `src/components/ui/avatar.tsx`

### Exports
- `Avatar` — root. Props add `size?: "default" | "sm" | "lg"`.
- `AvatarImage` — the portrait image.
- `AvatarFallback` — shown until/if the image fails (e.g. character initials).
- `AvatarBadge` / `AvatarGroup` / `AvatarGroupCount` — status badge and grouping helpers (unused in Stage 5).

### Notes
- Client component (`"use client"`).
