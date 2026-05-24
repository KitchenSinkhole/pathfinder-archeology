## ship.ts

**Purpose:** Zod decoder for `getCharacterShip`. Stage 12.1 location-poll persists `ship_type_id` to `ap_character.last_ship_type_id` for the head breadcrumb.
**File:** `src/lib/esi/decoders/ship.ts`

---

### characterShipSchema → EsiCharacterShip
`getCharacterShip` (`get_characters_character_id_ship`): `{ ship_type_id, ship_item_id, ship_name }` — all required per swagger.

`ship_item_id` is per-ship-instance (persists until repackaged); the poll captures it in the decoded shape but doesn't store it today. Useful for a future "did the pilot swap ships?" signal.
