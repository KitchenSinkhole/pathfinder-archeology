## killmail.ts

**Purpose:** Zod decoder for the full ESI killmail (`getKillmail`), used to enrich zKillboard list entries with victim/ship/time/attacker data.
**File:** `src/lib/esi/decoders/killmail.ts`

---

### killmailSchema
Parses `get_killmails_killmail_id_killmail_hash`. Pulls `killmail_id`, `killmail_time`, `solar_system_id`, `victim` (`character_id` / `corporation_id` / `alliance_id` / `ship_type_id`, all optional) and `attackers` (length is what the killboard uses). Permissive (`.loose()`); ignores the wide remainder of the swagger shape.

**Exports:** `killmailSchema`, `EsiKillmail`.
