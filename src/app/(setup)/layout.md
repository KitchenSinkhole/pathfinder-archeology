## SetupLayout

**Purpose:** Minimal HTML shell for the `/setup` ops console. No `(app)` chrome (no character switcher, no nav, no realtime). Renders an amber banner reminding the operator that this route bypasses EVE SSO.
**File:** `src/app/(setup)/layout.tsx`

### Renders
- Top amber banner naming the bypass and the env var that gates it.
- A centered max-w-3xl main column for the unlock form / trigger cards.
- `<Toaster />` from sonner so the actions can surface success/error toasts.

### Behaviour & Interactions
- Does **not** call `requireSession()` — that would defeat the purpose of `/setup` (operator recovery for a broken auth deploy). Access is gated downstream by `readSetupCookie()` in the page + every action.
