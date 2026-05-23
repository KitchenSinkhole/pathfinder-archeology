## route.ts — PATCH/DELETE /api/map/[mapId]/connections/[connId]

**Purpose:** Update or hard-delete a connection between two map systems.
**File:** `src/app/api/map/[mapId]/connections/[connId]/route.ts`

### PATCH
Updates only the flags present in the body. Toggling `isEol: true` stamps `eol_at` (the EOL-expiry cron key); setting it false clears it. Returns `{ ok, data, eventId }` where `data` is the `connection.update` patch.

**Body:** `{ scope?, massStatus?, jumpMassClass?, isEol?, isFrigate?, preserveMass?, isRolling? }` — all optional.

### DELETE
Hard-deletes the connection row (wormholes don't come back). Attached signatures cascade. Returns `{ ok, data, eventId }` where `data` is the `connection.delete` payload.

**Responses:** 200 ok, 400 mutation error / invalid id, 401 unauthenticated, 404 map not found.
