## aperture.config.ts

**Purpose:** Single source of truth for hard-coded app constants the spec says must NOT be runtime config (job cadences, JWK cap, downtime window, channel prefix, map ceilings).
**File:** `aperture.config.ts`

---

### apertureConfig
A frozen `as const` object exposed by named export. Later stages append fields here; nothing here is read from `process.env`.

Stage 0 seeds:
- `LOCATION_POLL_ONLINE_MS` — server-side location-poll cadence while a character is online (SPEC §5.3).
- `LOCATION_POLL_OFFLINE_MS` — cadence while offline.
- `JWK_REFETCH_MIN_INTERVAL_MS` — JWK-set refetch cap from SPEC §7 / footgun #3.
- `CCP_SSO_DOWNTIME_WINDOW_MIN` — minutes around 11:00 UTC tolerated as expected ESI outage.
- `MAP_EVENT_NOTIFY_CHANNEL_PREFIX` — `pg_notify` channel prefix for `pf_map_event` fanout (SPEC §5.2 / §6.5).
- `MAX_MAPS_PER_SCOPE` — legacy `pathfinder.ini` ceilings, refined in Phase 1.
- `MAX_SYSTEMS_PER_MAP` — applied where `pf_map_system.visible = true`.

### ApertureConfig
Inferred type alias for `typeof apertureConfig` so consumers don't need to import the runtime value just to type a parameter.
