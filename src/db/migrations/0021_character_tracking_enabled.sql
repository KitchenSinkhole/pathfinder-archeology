-- Stage 17.5 follow-up: per-character opt-out for server-side location
-- tracking. Default true so every existing character keeps being tracked; users
-- disable individual characters from the header Characters panel.
ALTER TABLE "ap_character" ADD COLUMN "tracking_enabled" boolean DEFAULT true NOT NULL;
