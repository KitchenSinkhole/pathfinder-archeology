-- Structure-intel owner mapping. The structure dialog now resolves the owner to
-- a real EVE corporation via ESI search, so the free-text `owner_name` is backed
-- by the corporation id it was picked from. Denormalized intel, not an FK to
-- `ap_corporation` (see `ap/structure.ts` for why). Nullable: pre-existing rows
-- keep their free-text `owner_name` with a null id until re-picked.
ALTER TABLE "ap_structure" ADD COLUMN "owner_corporation_id" bigint;
