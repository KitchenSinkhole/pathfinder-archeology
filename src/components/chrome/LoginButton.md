## LoginButton

**Purpose:** EVE SSO login button for the public splash, with a pending state during the redirect.
**File:** `src/components/chrome/LoginButton.tsx`

### Renders
A `<form action={loginAction}>` wrapping a submit `Button`; label flips to "Redirecting…" while pending.

### Behaviour & Interactions
- Submitting triggers `loginAction` (server) which redirects to EVE SSO.
- Pending state read via `useFormStatus`.

### Depends On
- `loginAction` from `src/app/(public)/actions.ts`; `Button` UI primitive.
