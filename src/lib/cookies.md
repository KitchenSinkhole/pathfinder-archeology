## cookies.ts

**Purpose:** Single source of truth for the cookie flags every same-origin auth cookie in this app sets. Closes SPEC §11 Q9.
**File:** `src/lib/cookies.ts`

---

### AUTH_COOKIE_OPTIONS

```ts
{
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
}
```

Imported by:
- `src/lib/auth.ts` — passed to the NextAuth `cookies:` block for the `sessionToken`, `callbackUrl`, and `csrfToken` cookies.
- (Follow-up de-dup) `src/lib/auth/link-cookie.ts` currently inlines the same flags; once the test surface in 16.1 lands these can be unified without behaviour change.

### Why centralise

Cookie flags are security-load-bearing and silently diverging between surfaces is exactly the kind of bug that doesn't surface until an audit. One constant, one place to flip.
