## formatters.ts

**Purpose:** Pure functions that turn a `MapEventPayload` + a pre-resolved naming context into a Discord webhook payload. No DB access — the dispatcher owns the joins.
**File:** `src/lib/webhooks/formatters.ts`

---

### isRallySetEvent(event: MapEventPayload): boolean
Returns true when `event.kind === 'system.updated'` AND `event.rallyAt` is a non-empty string. Used by the dispatcher to decide whether to fan a `system.updated` event out to `event='rally'` webhooks in addition to the always-on `history` fanout.

---

### formatHistoryMessage(event, ctx, mapName?): DiscordWebhookPayload | null
Build a Discord payload (single-line `content`) describing the event for a `history` webhook. Returns `null` for events that are nothing but cosmetic position updates (skip silently).

**Parameters:**
- `event` — the `ap_map_event.payload` validated against `mapEventPayloadSchema`.
- `ctx` — pre-resolved names (`mapName`, `characterName`, `systemName`, `sourceSystemName`, `targetSystemName`).
- `mapName` — defaults to `ctx.mapName`; override only for special cases.

**Returns:** `{ content: '**<map>** — <who> added **<system>** to the map.' }` shape.

---

### formatRallyMessage(event, ctx): DiscordWebhookPayload | null
Build a Discord embed payload for a `rally` webhook. Returns `null` if the event is not a rally-set event (defensive — callers should check `isRallySetEvent` first).

The embed is red (`0xE74C3C`), titled `"Rally point set in <system>"`, and timestamped with the event's `rallyAt` ISO string.

---

### Types

- `WebhookEventContext` — `{ mapName, characterName, systemName, sourceSystemName, targetSystemName }`. Every name field is `string | null`; the dispatcher fills what it can resolve and the formatter falls back to generic placeholders ("a system", "Aperture", …) for missing pieces.
