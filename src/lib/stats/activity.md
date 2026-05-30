## activity.ts

**Purpose:** Server-side reader that turns the `ap_activity_rollup` materialized view into the Statistics dialog's per-character, scope-filtered, period-bucketed activity table + sparkline series (Stage 17.7).
**File:** `src/lib/stats/activity.ts`

---

### Types
- `ActivityStatScope` — `'private' | 'corp' | 'alliance'`.
- `ActivityStatPeriod` — `'week' | 'month' | 'year'`.
- `ActivityTriplet` — `{ create, update, delete }` counts.
- `ActivityStatRow` — `{ mainCharacterId, characterName, portraitUrl, system, connection, signature, total, series }`. `mainCharacterId` is a string (`'0'` = unknown bucket); `series` is per-bucket totals oldest→newest (length 12).
- `ActivityStatsResponse` — `{ rows, label, prevAnchor, nextAnchor, hasNext }`.

These are re-exported from `src/types/index.ts`.

---

### resolveStatsAccess(session): Promise<ActivityStatScope[]>
Which scope tabs the session may view. `[]` when logged-out / inactive. `private` always present for an active character; `corp` when `corporation_id` is set, `alliance` when `alliance_id` is set. Admins get all three.

---

### loadActivityStats({ session, scope, period, anchor? }): Promise<ActivityStatsResponse>
Per-character activity for `scope` over the period containing `anchor` (ISO `yyyy-mm-dd`, defaults to today UTC).

- Resolves in-scope map ids via `viewableMapPredicate` (`src/lib/auth/rights.ts`) `AND type = scope AND deleted_at IS NULL`; admins (predicate `undefined`) filter by type only. No viewable maps → empty `rows`.
- One raw `db.execute` over `ap_activity_rollup` for those maps, excluding non-contributions (`kind NOT LIKE 'map.%' AND kind <> 'system.moved'` — see the MV's `system.moved` re-bucketing of drag-only position updates), `LEFT JOIN ap_character → ap_user`. **Main-character attribution:** `COALESCE(main_character_id, character.id, rollup.character_id)`; `0` (erased) collapses to the `'0'` unknown bucket.
- Each rollup row's ISO week → its Monday (`to_date(... ,'IYYY-IW')`); the Monday's bucket (week = itself, month = first-of-month, year = Jan-1) places it into one of 12 trailing buckets. The **current** (last) bucket fills the triplet columns + `total`; **all** buckets fill `series`.
- Display names resolved in one `inArray` query; `'0'` → `'(unknown)'`. Portraits via `images.evetech.net`.
- Rows sorted by current-period `total` desc, tie-broken by trailing series sum.

**Period nav fields:** `label` (`Week 22 · 2026` / `May 2026` / `2026`), `prevAnchor`/`nextAnchor` (ISO dates), `hasNext` (false once the selected period equals the current one — guards forward navigation into the future). All date math is UTC.

### Notes
- `SPARK_BUCKETS = 12`. `KIND_MAP` maps the 9 system/connection/signature kinds to `[group, action]` (system uses added/updated/removed → create/update/delete).
- Reads only the MV + `ap_character`/`ap_user`; never scans `ap_map_event` directly.
