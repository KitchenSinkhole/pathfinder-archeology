-- Stage 16.2 — Admin-only map event kinds.
--
-- Adds two new `ap_event_kind` rows for the admin maps panel:
--   * `map.restore` — admin clears `ap_map.deleted_at` (un-soft-deletes).
--   * `map.purge`   — admin hard-deletes a soft-deleted map immediately,
--                     skipping the 30-day `map-purge` cron grace.
--
-- `ap_map_event.kind` has no FK to `ap_event_kind`, so the seed is
-- documentation-grade rather than insert-prerequisite; included for parity
-- with how migration 0004 seeded the original 12 kinds.
--
-- Rollback: src/db/migrations/0014_admin_event_kinds.rollback.sql.
INSERT INTO "ap_event_kind" ("kind", "category") VALUES
    ('map.restore', 'map'),
    ('map.purge',   'map');
