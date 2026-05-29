-- Persist the pilot's custom ship name (ESI getCharacterShip.ship_name)
-- alongside last_ship_type_id so the presence hover panel can show what the
-- player named the hull, not just its type.
ALTER TABLE "ap_character" ADD COLUMN "last_ship_name" text;
