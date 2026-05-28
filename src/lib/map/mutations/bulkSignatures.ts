import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { apMapSignature } from '@/db/schema';
import type { MapEventPayload } from '@/lib/realtime/protocol';
import type { ResolvedSigRow } from '@/lib/map/signatureReader';
import type { SignatureGroupKey } from '@/types';
import type { ActionResult } from './core';
import { createSignature, updateSignature, deleteSignature } from './signatures';
import { deleteConnection } from './connections';

/**
 * Bulk signature-paste orchestrator (Stage 10.2). Diffs incoming resolved rows
 * against the system's existing signatures, then routes each diff item through
 * the existing per-sig helpers (`createSignature`/`updateSignature`/`deleteSignature`)
 * — plus `deleteConnection` for orphaned WH edges when `removeOrphanedConnections`
 * is on — under a single outer `db.transaction()`. All N events commit
 * atomically: the `tg_map_event_notify` trigger fires once per row after the
 * outer commit, fanning N envelopes; if any helper throws, the whole batch
 * rolls back (no half-written sigs, no orphan event rows).
 *
 * Returns the full committed `MapEventPayload[]` so the initiating client can
 * register every `eventId` in its dedupe set and apply each payload locally,
 * matching the contract `awaitServer` uses for single-event mutations.
 */

export type BulkPasteOptions = {
  addMissing: boolean;
  updateExisting: boolean;
  removeMissing: boolean;
  removeOrphanedConnections: boolean;
};

export type BulkPasteSummary = {
  added: number;
  updated: number;
  removed: number;
  connectionsRemoved: number;
};

export type BulkPasteResult = {
  summary: BulkPasteSummary;
  payloads: MapEventPayload[];
};

export type PasteSignaturesInput = {
  mapId: bigint;
  mapSystemId: bigint;
  characterId: bigint | null;
  rows: ResolvedSigRow[];
  options: BulkPasteOptions;
  /** Default `expiresAt` for newly-created sigs (caller-supplied so the constant lives in one place). */
  defaultExpiresAt: Date;
};

export async function pasteSignatures(
  input: PasteSignaturesInput,
): Promise<ActionResult<BulkPasteResult>> {
  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: apMapSignature.id,
          sigId: apMapSignature.sigId,
          groupKey: apMapSignature.groupKey,
          typeId: apMapSignature.typeId,
          name: apMapSignature.name,
          mapConnectionId: apMapSignature.mapConnectionId,
        })
        .from(apMapSignature)
        .where(eq(apMapSignature.mapSystemId, input.mapSystemId));

      const existingBySigId = new Map(existing.map((s) => [s.sigId, s]));

      // Dedupe incoming by sigId (keep last — matches "most recent typo wins").
      const incomingBySigId = new Map<string, ResolvedSigRow>();
      for (const r of input.rows) incomingBySigId.set(r.sigId, r);

      const payloads: MapEventPayload[] = [];
      let added = 0;
      let updated = 0;
      let removed = 0;
      let connectionsRemoved = 0;

      // Creates + updates.
      for (const [sigId, incoming] of incomingBySigId) {
        const existingRow = existingBySigId.get(sigId);

        if (!existingRow) {
          if (!input.options.addMissing) continue;
          // For cosmic sigs the EVE-emitted site name is meaningful and we
          // persist it on create. For wormhole sigs `incoming.name` is the
          // WH code (e.g. "B274") mirrored from the resolved `typeId`.
          const res = await createSignature({
            mapId: input.mapId,
            mapSystemId: input.mapSystemId,
            characterId: input.characterId,
            sigId,
            groupKey: incoming.groupKey,
            typeId: incoming.typeId,
            name: incoming.name,
            description: null,
            expiresAt: input.defaultExpiresAt,
            tx,
          });
          if (!res.ok) throw new Error(res.error);
          payloads.push(res.data);
          added += 1;
          continue;
        }

        if (!input.options.updateExisting) continue;

        // Only overwrite when the paste resolved to a real value that differs.
        // Treat incoming nulls as "unknown — don't clobber prior classification".
        // For existing rows we never overwrite `name`: it's either user-typed
        // (cosmic sigs) or the wormhole-code mirror set by the create path /
        // the row-level type cell; preserving prior input matches the legacy
        // "paste shouldn't clobber typed-in data" contract.
        const patch: {
          groupKey?: SignatureGroupKey | null;
          typeId?: number | null;
        } = {};
        if (incoming.groupKey !== null && incoming.groupKey !== existingRow.groupKey) {
          patch.groupKey = incoming.groupKey;
        }
        if (incoming.typeId !== null && incoming.typeId !== existingRow.typeId) {
          patch.typeId = incoming.typeId;
        }
        if (Object.keys(patch).length === 0) continue;

        const res = await updateSignature({
          mapId: input.mapId,
          signatureId: existingRow.id,
          characterId: input.characterId,
          patch,
          tx,
        });
        if (!res.ok) throw new Error(res.error);
        payloads.push(res.data);
        updated += 1;
      }

      // Removes (existing not in incoming).
      if (input.options.removeMissing) {
        for (const [sigId, existingRow] of existingBySigId) {
          if (incomingBySigId.has(sigId)) continue;

          const sigRes = await deleteSignature({
            mapId: input.mapId,
            signatureId: existingRow.id,
            characterId: input.characterId,
            tx,
          });
          if (!sigRes.ok) throw new Error(sigRes.error);
          payloads.push(sigRes.data);
          removed += 1;

          if (
            input.options.removeOrphanedConnections &&
            existingRow.mapConnectionId !== null
          ) {
            const connRes = await deleteConnection({
              mapId: input.mapId,
              connectionId: existingRow.mapConnectionId,
              characterId: input.characterId,
              tx,
            });
            if (!connRes.ok) throw new Error(connRes.error);
            payloads.push(connRes.data);
            connectionsRemoved += 1;
          }
        }
      }

      const summary: BulkPasteSummary = { added, updated, removed, connectionsRemoved };
      return { summary, payloads };
    });

    return { ok: true, data: result, eventId: 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Bulk paste failed.' };
  }
}
