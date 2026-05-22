# Drizzle Schema Index

Single Postgres database, single schema. Static CCP data uses the `universe_` prefix
(mandatory). Columns are `snake_case` in the DB, `camelCase` in TS via Drizzle `name:`.
Universe spatial IDs are `integer`; coords are `doublePrecision`. All time columns are
`timestamptz`. Real FKs across former schema boundaries.

Barrel: `src/db/schema/index.ts` re-exports every table + the effective-dogma view.
Row types are inferred and re-exported from `src/types/index.ts`.

## `universe/geography.ts`

| Table (`const`) | DB name | Key columns / FKs |
|---|---|---|
| `universeRegion` | `universe_region` | `id` int PK, `name`, `description` |
| `universeConstellation` | `universe_constellation` | `id` int PK, `region_id` → region **CASCADE**, `name`, `x`/`y`/`z` double |
| `universeSystem` | `universe_system` | `id` int PK, `constellation_id` → constellation **CASCADE**, `name`, `security` (label `H`/`L`/`0.0`/`C1`–`C6`/`P`/`A`), `true_sec` double, `security_status` double, `security_class`, `effect`, `x`/`y`/`z` double |
| `universeStargateEdge` | `universe_stargate_edge` | `from_system_id` → system **CASCADE**, `to_system_id` → system **CASCADE**, PK `(from,to)`, index on `to_system_id` |

## `universe/items.ts`

| Table (`const`) | DB name | Key columns / FKs |
|---|---|---|
| `universeCategory` | `universe_category` | `id` int PK, `name`, `published` bool |
| `universeGroup` | `universe_group` | `id` int PK, `category_id` → category **CASCADE**, `name`, `published` bool |
| `universeType` | `universe_type` | `id` int PK, `group_id` → group **CASCADE**, `name`, `description`, `mass`/`volume`/`capacity`/`radius`/`packaged_volume` double, `portion_size`/`market_group_id`/`graphic_id` int, `published` bool |

## `universe/dogma.ts`

| Table (`const`) | DB name | Key columns / FKs |
|---|---|---|
| `universeDogmaAttribute` | `universe_dogma_attribute` | `id` int PK, `name`, `display_name`, `description`, `published`/`stackable`/`high_is_good` bool, `default_value` double, `icon_id`/`unit_id` int |
| `universeTypeAttribute` | `universe_type_attribute` | `type_id` → type **CASCADE**, `attribute_id` → dogma_attribute **CASCADE**, `value` double, PK `(type_id, attribute_id)` |
| `universeTypeOverride` | `universe_type_override` | `type_id` → type **CASCADE**, `attr_id` int, `value` double NOT NULL, `reason`, `updated_at` timestamptz default now(), PK `(type_id, attr_id)` |

## `universe/statics.ts`

| Table (`const`) | DB name | Key columns / FKs |
|---|---|---|
| `universeSystemStatic` | `universe_system_static` | `system_id` → system **CASCADE**, `type_id` → type **CASCADE**, PK `(system_id, type_id)` |

## `universe/views.ts`

| View (`const`) | DB name | Notes |
|---|---|---|
| `universeTypeAttributeEffective` | `universe_type_attribute_effective` | `.existing()` typing handle. `COALESCE(override.value, type_attribute.value)` per `(type_id, attr_id)`. DDL in custom migration. |
