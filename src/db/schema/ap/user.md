## user.ts

**Purpose:** The `ap_user` account anchor — groups the one-or-more characters a person owns (SPEC §9 auth principals).
**File:** `src/db/schema/ap/user.ts`

---

### apUser
`pgTable('ap_user', …)`:
- `id` — `integer generated always as identity`, PK.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

Stage 2 creates one user per newly-seen character. Linking additional characters onto an existing user (the SSO tile grid / "add character" flow) lands in Stage 5; `ap_character.user_id` already FKs here so no migration is needed then.
