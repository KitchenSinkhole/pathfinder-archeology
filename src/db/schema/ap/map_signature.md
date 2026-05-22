## map_signature.ts

**Purpose:** The `ap_map_signature` table — a scan signature in a system, optionally bound to the connection it resolves to.
**File:** `src/db/schema/ap/map_signature.ts`

---

### apMapSignature
`pgTable('ap_map_signature', …)`:
- `id` — `bigserial` PK.
- `map_system_id` — `bigint` FK → `ap_map_system.id` `ON DELETE CASCADE`.
- `map_connection_id` — `bigint` FK → `ap_map_connection.id` `ON DELETE CASCADE`, nullable. Bound only when the sig is the wormhole.
- `sig_id` — `text`, required (in-game 3-char id, e.g. "ABC").
- `group_id` — `integer` FK → `universe_group.id` `ON DELETE SET NULL`.
- `type_id` — `integer` FK → `universe_type.id` `ON DELETE SET NULL`.
- `name`, `description` — `text`, nullable.
- `created_at` / `updated_at` — `timestamptz`, default `now()`.
- `expires_at` — `timestamptz`, required. The signature-reap cron deletes rows where `expires_at < now()`.

**Unique:** `(map_system_id, sig_id)` (`ap_map_signature_system_sig_uq`).
