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
| `scripts/data/wormhole-classes.csv` | `universe_wormhole` | `code;sourceClass;targetClass` (anoik.is /wormholes); resolves WH code → typeId; empty class cell → null (K162 = any); skipped with a warning if absent |

---

### Vendored community data (anoik.is)

WH data CCP omits from the SDE/ESI is reconstructed by [anoik.is](https://anoik.is). Both files below were derived from anoik.is's single static dataset `https://anoik.is/static/static.json?version=11`, **pulled 2026-05-22**. anoik.is serves this as one cached static asset (the site loads it once into `localStorage`), so the whole dataset is one request — no page scraping. anoik.is is an EVE Online Partner; data is CCP-derived and used here under EVE's third-party developer terms with attribution.

- **`system-static.csv`** (`systemID;typeID`, 3772 rows) — one row per J-space system × static spawn. `systemID` = `solarSystemID`; `typeID` resolved from each system's `statics[]` code via the dataset's per-code `typeID`.
- **`wormhole-classes.csv`** (`code;sourceClass;targetClass`, 90 rows incl. K162) — the WH-type routing catalog. anoik class labels are mapped to Aperture's vocabulary (`c1`→`C1` … `c6`→`C6`, `c13`→`C13`, `hs`→`HS`, `ls`→`LS`, `ns`→`NS`, `thera`→`Thera`). Two cases collapse to empty (→ NULL):
  - **Multi-source holes** (e.g. `B449` src `[ls,ns]`): the schema defines a null `source_class` as "any", which already models a wandering hole that spawns from several classes — so multi-source → empty `sourceClass`.
  - **Drifter destinations** (`B735`/`C414`/`R259`/`S877`/`V928`, dest = barbican/conflux/redoubt/sentinel/vidette = classes 14–18): not in Aperture's class vocabulary, so `targetClass` is left empty (unmodeled). Revisit if C14–C18 are added to the label set.
  - K162 (the universal reverse-exit) has both cells empty by definition.

Re-pull: refetch `static.json`, regenerate, and re-validate the Stage-1.5 gate (valid-or-null labels, K162 both-null, `A239` resolves).

---

### SDE_BUILD / SDE_RELEASE_DATE / SDE_ZIP_URL
Pinned-build constants. Bump deliberately and re-validate the Phase-0 gate counts.

### ensureSdeZip(): Promise<string>
Downloads the pinned zip into `.sde-cache/` if not already present; returns its path.

### runIngest(): Promise<IngestResult>
Orchestrates the full ingest in FK-safe order. Upserts via `onConflictDoUpdate` (re-runnable). Returns `{ build, counts }` (row counts per logical table). Bulk inserts chunked at 1000.
