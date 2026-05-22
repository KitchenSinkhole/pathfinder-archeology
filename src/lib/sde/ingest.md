## ingest.ts

**Purpose:** One-shot, re-runnable ingest of the pinned CCP SDE build into every `universe_*` table.
**File:** `src/lib/sde/ingest.ts`

Pinned build: **`SDE_BUILD = 3351823`** (released 2026-05-19), YAML variant. Source: https://developers.eveonline.com/docs/services/static-data. Zip cached at `.sde-cache/sde-<build>-yaml.zip`.

### SDE file → table mapping (new flat SDE layout)
| SDE entry | Target table | Notes |
|---|---|---|
| `categories.yaml` | `universe_category` | `name.en`, `published` |
| `groups.yaml` | `universe_group` | `categoryID`, `name.en` |
| `dogmaAttributes.yaml` | `universe_dogma_attribute` | `name`/`description` are plain strings; `displayName` localized |
| `types.yaml` | `universe_type` | 52k rows; builds WH-code→typeId map (group `988`, name `"Wormhole <CODE>"`) |
| `typeDogma.yaml` | `universe_type_attribute` | `dogmaAttributes[]`; skips type/attr ids absent from their tables (FK safety) |
| `mapRegions.yaml` | `universe_region` | `name.en`, `description.en` |
| `mapConstellations.yaml` | `universe_constellation` | `position.{x,y,z}`; `wormholeClassID` retained for system security derivation |
| `mapSolarSystems.yaml` | `universe_system` | `security` via `deriveSecurityLabel`; `trueSec` = rounded status; `effect` null (not in SDE) |
| `mapStargates.yaml` | `universe_stargate_edge` | edge `(solarSystemID → destination.solarSystemID)`, deduped, skips edges whose endpoint system is absent |
| `scripts/data/system-static.csv` | `universe_system_static` | vendored community data (WH statics not in SDE); skipped with a warning if absent |
| `scripts/data/wormhole-overrides.csv` | `universe_type_override` | `Id;Name;scanWormholeStrength`; resolves WH code → typeId, writes attr `3974` with `reason='esi-missing-3974'` |

---

### SDE_BUILD / SDE_RELEASE_DATE / SDE_ZIP_URL
Pinned-build constants. Bump deliberately and re-validate the Phase-0 gate counts.

### ensureSdeZip(): Promise<string>
Downloads the pinned zip into `.sde-cache/` if not already present; returns its path.

### runIngest(): Promise<IngestResult>
Orchestrates the full ingest in FK-safe order. Upserts via `onConflictDoUpdate` (re-runnable). Returns `{ build, counts }` (row counts per logical table). Bulk inserts chunked at 1000.
