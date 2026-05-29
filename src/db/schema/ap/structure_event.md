## structure_event.ts

**Purpose:** The `ap_structure_event` table — append-only accountability log for manual structure intel (`ap_structure`); one row per create/update/delete, stamped with the acting character.
**File:** `src/db/schema/ap/structure_event.ts`

---

### apStructureEvent
`pgTable('ap_structure_event', …)`:
- `id` — `bigserial` PK.
- `structure_id` — `bigint`, not null. **No FK** — a `delete` event must survive the hard-delete of its `ap_structure` row.
- `system_id` — `integer`, not null. **No FK** — kept decoupled from SDE re-ingest; supports per-system / griefer-by-system audit queries.
- `character_id` — `bigint` FK → `ap_character.id` `ON DELETE SET NULL` (audit actor; erasing a character must not wipe the history row).
- `kind` — `structure_event_kind` enum (`create` | `update` | `delete`), not null.
- `payload` — `jsonb`, nullable. The values written (create/update) or the full pre-delete row snapshot (delete), so deleted intel is recoverable in an audit.
- `occurred_at` — `timestamptz`, default `now()`, not null.

**Indexes:** `structure_id` (`ap_structure_event_structure_id_idx`), `character_id` (`ap_structure_event_character_id_idx`, griefer lookup).

### Notes
- Structures are deployment-global (no `map_id`) and so cannot live in `ap_map_event`. This is their dedicated, single-source history — not a parallel audit table to `ap_map_event`. The `structureEventKind` enum lives in `ap/enums.ts`.
- Written by `src/lib/structures/mutations.ts` in the same transaction as the structure-row write.
