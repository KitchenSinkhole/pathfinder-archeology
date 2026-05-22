## layout.tsx (app)

**Purpose:** Authenticated layout — gates the `(app)` tree behind a session and wraps children in page chrome (header/footer) + the toast portal.
**File:** `src/app/(app)/layout.tsx`

### Renders
A `RealtimeProvider` wrapping the chrome: the `RealtimeStatusBanner` (degraded-mode), `AppHeader` (active character + roster) above a `<main>` content area, `AppFooter` below, and a `sonner` `Toaster`.

### Behaviour & Interactions
- `requireSession()` redirects to `/` when logged out.
- Resolves the active character (`getActiveCharacter`) and the account roster (`getAccountCharacters`) server-side; redirects to `/` if the active character row is missing.
- The `RealtimeProvider` boots the SharedWorker once for the whole authenticated tree, so the banner and any `useMapSubscription` share one socket.

### Depends On
- `src/lib/session.ts`, `AppHeader`, `AppFooter`, `sonner`, `RealtimeProvider` (`@/lib/realtime/useRealtime`), `RealtimeStatusBanner`.
