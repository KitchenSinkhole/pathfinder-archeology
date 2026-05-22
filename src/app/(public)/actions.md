## actions.ts (public)

**Purpose:** Server Action backing the public splash login button.
**File:** `src/app/(public)/actions.ts`

---

### loginAction(): Promise<void>
`signIn('eve', { redirectTo: '/maps' })` — starts the EVE SSO flow and redirects. Used by `LoginButton`.

### Notes
- `'use server'` module.
