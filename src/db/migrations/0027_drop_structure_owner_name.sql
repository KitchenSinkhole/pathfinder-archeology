-- Drop the free-text structure owner. With `owner_corporation_id` FK'd to the
-- `universe_corporation` cache, the owner name has a single source of truth
-- (the cache row); the denormalized free-text column is removed. Any legacy
-- owner text that was never resolved to a corp is discarded.
ALTER TABLE "ap_structure" DROP COLUMN "owner_name";
