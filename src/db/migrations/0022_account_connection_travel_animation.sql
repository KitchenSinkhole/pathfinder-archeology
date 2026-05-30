-- Per-account toggle for the connection travel animation (a subtle moving dot
-- played on a connection when a tracked pilot jumps across it). Default true so
-- the effect is on for every existing account; users opt out from Account
-- settings.
ALTER TABLE "ap_user" ADD COLUMN "connection_travel_animation" boolean DEFAULT true NOT NULL;
