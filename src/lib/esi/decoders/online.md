## online.ts

**Purpose:** Zod decoder for `getCharacterOnline`. Stage 12.1 location-poll uses this to gate its cadence (online → 5s, offline → 60s).
**File:** `src/lib/esi/decoders/online.ts`

---

### characterOnlineSchema → EsiCharacterOnline
`getCharacterOnline` (`get_characters_character_id_online`): `{ online, last_login?, last_logout?, logins? }`. Only `online` is required by the swagger; the timestamps and lifetime counter are optional per CCP.

The poll only consumes `online`; the rest is captured for any future "last login" UI without a follow-up decoder change.
