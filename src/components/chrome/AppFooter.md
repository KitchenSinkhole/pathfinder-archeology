## AppFooter

**Purpose:** Static page footer with the product blurb and CCP trademark notice.
**File:** `src/components/chrome/AppFooter.tsx`

### Renders
A bordered footer strip: the product line plus a `CreditsDialog` "Credits" trigger on the left, the CCP attribution on the right.

### Props
None. (Server component; reads the app version from `package.json` and passes it to `CreditsDialog`.)

### Depends On
- `CreditsDialog` (client) — self-contained credits/about dialog with its own trigger.
