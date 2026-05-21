## utils.ts

**Purpose:** Tiny className helper from shadcn init. Merges Tailwind classes safely, last-write-wins.
**File:** `src/lib/utils.ts`

---

### cn(...inputs: ClassValue[]): string
Composes class names via `clsx`, then collapses Tailwind conflicts via `tailwind-merge`. Used pervasively by shadcn components and any component that conditionally toggles Tailwind classes.

**Returns:** A deduped Tailwind class string.
