## map-signature-paste.test.ts

**Purpose:** Integration coverage for `pasteSignatures` — the Stage 10.2 bulk orchestrator. Verifies the diff matrix, exact `ap_map_event` count, end-state correctness, optional orphan-connection tear-down, and atomic rollback on partial failure.
**File:** `tests/integration/map-signature-paste.test.ts`

Gated on `RUN_DB_TESTS=1`. Runs against the migrated Postgres in `docker-compose`.

Cases:
1. **Diff**: 1 pre-existing classified + 1 unclassified seed; paste classifies one, adds two new, omits one with `removeMissing: true` → 4 `ap_map_event` rows; `name` on the updated row is preserved.
2. **removeOrphanedConnections**: an existing sig is bound to a WH connection; an empty paste with both `removeMissing` and `removeOrphanedConnections` deletes the sig AND the connection (`signature.delete` + `connection.delete` events).
3. **Rollback**: seeded sig + paste that would re-add the same `sigId` (with `updateExisting: false`) triggers the `(map_system_id, sig_id)` unique-constraint violation; the whole batch rolls back so no new events land and the other rows in the paste don't persist.
