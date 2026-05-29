-- Stage 18. Remove `is_frigate` from `ap_map_connection`.
-- The boolean was redundant with `jump_mass_class = 's'` (small/frigate holes).
-- Use `jump_mass_class = 's'` as the canonical signal.
ALTER TABLE ap_map_connection DROP COLUMN is_frigate;
