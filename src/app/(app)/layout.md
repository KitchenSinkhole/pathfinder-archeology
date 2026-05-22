## layout.tsx (app)

**Purpose:** Authenticated layout — gates the `(app)` tree behind a session and wraps children in page chrome (header/footer) + the toast portal.
**File:** `src/app/(app)/layout.tsx`

### Renders
`AppHeader` (with active character + roster) above a `<main>` content area, `AppFooter` below, and a `sonner` `Toaster`.

### Behaviour & Interactions
- `requireSession()` redirects to `/` when logged out.
- Resolves the active character (`getActiveCharacter`) and the account roster (`getAccountCharacters`) server-side; redirects to `/` if the active character row is missing.

### Depends On
- `src/lib/session.ts`, `AppHeader`, `AppFooter`, `sonner`.
