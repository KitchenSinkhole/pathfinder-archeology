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
- `status_expires_at` — `timestamptz`, nullable. Set on `kicked` rows to the moment the timeout ends; the Stage 15.6 `character-cleanup` cron flips `status` back to `active` and clears this column when `now() >= status_expires_at`. NULL on `active` / `banned` rows.
- `authz_level` — `authz_level` enum, default `member`. Derived state: `syncCharacterAuthz` sets `admin` ↔ `member` based on whether ESI returns the `Director` corp role; `manager` is reserved for explicit admin-panel grants (Stage 16) and is never auto-overwritten.
- `authz_synced_at` — `timestamptz`, nullable. When `syncCharacterAuthz` last reconciled `authz_level` and `ap_character_role` membership against ESI. Used by the `character-cleanup` job to throttle resync to stale rows.
- `last_system_id`, `last_ship_type_id` — `integer`, nullable. Last-known location state cached by the Stage 12 `location-poll` job. No FK to `universe_system` / `universe_type` — a universe rebuild would otherwise have to honour every stale pointer, and the next poll tick overwrites the value anyway.
- `last_ship_name` — `text`, nullable. The pilot's custom ship name (ESI `getCharacterShip.ship_name`) — what the player named this hull, not its type. Cached by the poll alongside `last_ship_type_id`; shown in the presence hover panel.
- `last_online` — `boolean`, nullable. Most recent `getCharacterOnline` result; `NULL` before the first poll tick.
- `last_location_at` — `timestamptz`, nullable. When `last_system_id` was last refreshed; stale when the character is offline (offline ticks update only `last_online`).
- `tracking_enabled` — `boolean`, `NOT NULL DEFAULT true` (Stage 17.5 follow-up). Per-character opt-out for server-side location tracking. Tracked by default so a character is followed the moment it is linked (first EVE SSO); users disable individual characters from the header Characters panel. When `false` the character is polled for nobody and folds onto no map — `setCharacterTrackingAction` deletes its `ap_map_character_tracking` rows and the `location-poll` handler exits early as defense in depth.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.

The persisted refresh-token rotation invariant (SPEC §7, footgun #2) writes `esi_refresh_token` here **before** the rotated access token is returned to any caller — see `src/lib/auth/eve-provider.ts`.
