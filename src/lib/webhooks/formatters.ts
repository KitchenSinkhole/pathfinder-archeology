import type { DiscordWebhookEmbed, DiscordWebhookPayload } from '@/lib/integrations/discord';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Resolved naming context the dispatcher hands to a formatter so the
 * formatter never has to touch the DB. The dispatcher joins
 * `ap_map`, `ap_character`, `ap_map_system` + `universe_system` once per event
 * before delegating here.
 */
export interface WebhookEventContext {
  mapName: string;
  /** Acting character name, or null for job-driven events (signature reap, …). */
  characterName: string | null;
  /** Primary system name when the event references one system. */
  systemName: string | null;
  /** Connection events have two endpoints — set both when known. */
  sourceSystemName: string | null;
  targetSystemName: string | null;
}

const RALLY_EMBED_COLOR = 0xe74c3c; // Discord red

/**
 * Whether a `system.updated` event represents a rally being set (not cleared).
 * Used both by the dispatcher (to decide whether to fan out to rally webhooks)
 * and by the rally formatter.
 */
export function isRallySetEvent(event: MapEventPayload): boolean {
  if (event.kind !== 'system.updated') return false;
  return typeof event.rallyAt === 'string' && event.rallyAt.length > 0;
}

/** Build the Discord payload for a `history` webhook. Returns `null` if the event has nothing to say. */
export function formatHistoryMessage(
  event: MapEventPayload,
  ctx: WebhookEventContext,
  mapName: string = ctx.mapName,
): DiscordWebhookPayload | null {
  const who = ctx.characterName ?? 'Aperture';
  const line = describeEvent(event, ctx, who);
  if (!line) return null;
  return { content: `**${mapName}** — ${line}` };
}

/** Build the Discord payload for a `rally` webhook. Caller should only invoke for `isRallySetEvent`. */
export function formatRallyMessage(
  event: MapEventPayload,
  ctx: WebhookEventContext,
): DiscordWebhookPayload | null {
  if (!isRallySetEvent(event)) return null;
  // Narrowed by isRallySetEvent.
  const rallyAt = (event as Extract<MapEventPayload, { kind: 'system.updated' }>).rallyAt as string;
  const system = ctx.systemName ?? 'an unknown system';
  const setter = ctx.characterName ?? 'Aperture';

  const embed: DiscordWebhookEmbed = {
    title: `Rally point set in ${system}`,
    description: `Set by **${setter}** on **${ctx.mapName}**.`,
    color: RALLY_EMBED_COLOR,
    timestamp: rallyAt,
  };
  return { embeds: [embed] };
}

function describeEvent(
  event: MapEventPayload,
  ctx: WebhookEventContext,
  who: string,
): string | null {
  switch (event.kind) {
    case 'system.added': {
      return `${who} added **${event.name}** to the map.`;
    }
    case 'system.removed': {
      const name = ctx.systemName ?? 'a system';
      return `${who} removed **${name}** from the map.`;
    }
    case 'system.updated': {
      const name = ctx.systemName ?? 'a system';
      if (isRallySetEvent(event)) {
        return `${who} set a rally point in **${name}**.`;
      }
      if (event.rallyAt === null) {
        return `${who} cleared the rally point in **${name}**.`;
      }
      if (event.status) {
        return `${who} set **${name}** status to \`${event.status}\`.`;
      }
      if (event.locked === true) return `${who} locked **${name}**.`;
      if (event.locked === false) return `${who} unlocked **${name}**.`;
      if (typeof event.alias === 'string') {
        return `${who} aliased **${name}** to \`${event.alias}\`.`;
      }
      if (event.alias === null) {
        return `${who} cleared the alias on **${name}**.`;
      }
      if (typeof event.tag === 'string') {
        return `${who} tagged **${name}** \`${event.tag}\`.`;
      }
      if (event.tag === null) return `${who} cleared the tag on **${name}**.`;
      if ('intelNotes' in event) {
        return `${who} updated intel on **${name}**.`;
      }
      // Position-only updates are noise; skip.
      return null;
    }
    case 'connection.create': {
      const src = ctx.sourceSystemName ?? 'a system';
      const dst = ctx.targetSystemName ?? 'another system';
      return `${who} connected **${src}** ↔ **${dst}**.`;
    }
    case 'connection.update': {
      const src = ctx.sourceSystemName ?? 'a system';
      const dst = ctx.targetSystemName ?? 'another system';
      if (event.isEol === true) return `${who} marked **${src}** ↔ **${dst}** as EOL.`;
      if (event.isEol === false) return `${who} cleared EOL on **${src}** ↔ **${dst}**.`;
      if (event.massStatus) {
        return `${who} marked **${src}** ↔ **${dst}** mass \`${event.massStatus}\`.`;
      }
      if (event.isRolling === true) return `${who} started rolling **${src}** ↔ **${dst}**.`;
      if (event.isRolling === false) return `${who} stopped rolling **${src}** ↔ **${dst}**.`;
      if (event.scope) return `${who} set **${src}** ↔ **${dst}** scope \`${event.scope}\`.`;
      return null;
    }
    case 'connection.delete': {
      const src = ctx.sourceSystemName ?? 'a system';
      const dst = ctx.targetSystemName ?? 'another system';
      return `${who} removed the connection **${src}** ↔ **${dst}**.`;
    }
    case 'signature.create': {
      const name = ctx.systemName ?? 'a system';
      return `${who} added signature \`${event.sigId}\` in **${name}**.`;
    }
    case 'signature.update': {
      const name = ctx.systemName ?? 'a system';
      const sig = event.sigId ?? 'a signature';
      return `${who} updated signature \`${sig}\` in **${name}**.`;
    }
    case 'signature.delete': {
      const name = ctx.systemName ?? 'a system';
      return `${who} removed a signature in **${name}**.`;
    }
    case 'map.create':
      return `${who} created the map \`${event.name}\`.`;
    case 'map.update':
      return event.name ? `${who} renamed the map to \`${event.name}\`.` : `${who} updated map settings.`;
    case 'map.delete':
      return event.deletedAt
        ? `${who} soft-deleted the map (30-day grace).`
        : `${who} restored the map.`;
    default:
      return null;
  }
}
