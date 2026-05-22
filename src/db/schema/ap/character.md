## character.ts

**Purpose:** The `ap_character` table — one row per EVE character, holding membership, moderation state, authority level, and the encrypted ESI token set.
**File:** `src/db/schema/ap/character.ts`

---

### apCharacter
`pgTable('ap_character', …)`:
- `id` — `bigint` PK, the EVE character id (natural 64-bit key, not generated).
- `user_id` — `integer` FK → `ap_user.id` `ON DELETE CASCADE`.
- `name`, `owner_hash` — display name and CCP account-ownership hash (rotates on character transfer; canonical "same character" signal, SPEC §7).
- `corporation_id`, `alliance_id` — nullable `bigint`. **No FK yet** — `ap_corporation`/`ap_alliance` tables arrive in a later stage; these become real FKs then.
- `esi_access_token`, `esi_refresh_token` — `text`, **AES-256-GCM ciphertext blobs** from `src/lib/crypto.ts`. Never plaintext.
- `esi_access_token_expires` — `timestamptz`.
- `esi_scopes` — `text[]`.
- `status` — `character_status` enum, default `active`; `status_changed_at` / `status_reason` accompany it.
- `authz_level` — `authz_level` enum, default `member`.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

The persisted refresh-token rotation invariant (SPEC §7, footgun #2) writes `esi_refresh_token` here **before** the rotated access token is returned to any caller — see `src/lib/auth/eve-provider.ts`.
