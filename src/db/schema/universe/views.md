## views.ts

**Purpose:** Typing-only Drizzle handle for the `universe_type_attribute_effective` view.
**File:** `src/db/schema/universe/views.ts`

Exports: `universeTypeAttributeEffective` (`pgView(...).existing()`). Columns `typeId`, `attrId`, `value`. The view's DDL lives in a custom migration; `.existing()` keeps Drizzle Kit from emitting CREATE/DROP. Returns `COALESCE(override.value, type_attribute.value)`.
