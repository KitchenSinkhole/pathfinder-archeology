## signatures.ts

**Purpose:** Signature CRUD mutation helpers — each is exactly one `commitMapEvent` call.
**File:** `src/lib/map/mutations/signatures.ts`

---

### createSignature(input: CreateSignatureInput): Promise<ActionResult<MapEventPayload>>
Inserts an `ap_map_signature` row and emits `signature.create` with the full body (all columns the canvas needs, including `createdAt`/`updatedAt`). Does not validate that `mapSystemId` belongs to `mapId` at this layer — the calling route handler is expected to have already confirmed map ownership.

**Parameters:**
- `input.mapId` — the owning map (for the event row).
- `input.mapSystemId` — `ap_map_system.id` (the system the sig is in).
- `input.mapConnectionId` — optional FK to the resolved wormhole connection.
- `input.sigId` — in-game 3-char scan id (e.g. `"ABC"`).
- `input.expiresAt` — when the sig ages out (set by the caller, typically now + 24 h).
- `input.tx` *(optional)* — outer Drizzle transaction (see `bulkSignatures.ts`). Forwarded to `commitMapEvent`.
- remaining fields — `groupId`, `typeId`, `name`, `description` (all optional).

---

### updateSignature(input: UpdateSignatureInput): Promise<ActionResult<MapEventPayload>>
Patches only the keys present in `input.patch`. Validates ownership by joining through `apMapSystem.mapId` before the update — throws `"Signature does not belong to this map."` if mismatched. Emits `signature.update` with only the changed fields (plus `id` and `updatedAt`). Accepts optional `input.tx` for joined-batch commits.

---

### deleteSignature(input: DeleteSignatureInput): Promise<ActionResult<MapEventPayload>>
Hard-deletes the signature row. Validates ownership through `apMapSystem.mapId` (same check as `updateSignature`). Emits `signature.delete` → `{ id }`. Accepts optional `input.tx`.

---

### Types
- `CreateSignatureInput` — full create payload.
- `UpdateSignaturePatch` — all fields optional; only present keys are written.
- `UpdateSignatureInput` — wraps `signatureId`, `mapId`, `characterId`, `patch`.
- `DeleteSignatureInput` — `mapId`, `signatureId`, `characterId`.
