import { toast } from 'sonner';
import { pasteSignaturesOnServer } from '@/lib/map/client';
import type { BulkPasteOptions, MapEventPayload, ParsedSigRow } from '@/types';

/**
 * Non-destructive defaults for the CTRL+V fast-paste path. The fast path has no
 * preview to catch an accidental removal, so it never removes — only adds new
 * sigs and updates changed ones. (The dialog carries its own editable options.)
 */
export const FAST_PASTE_OPTIONS: BulkPasteOptions = {
  addMissing: true,
  updateExisting: true,
  removeMissing: false,
  removeOrphanedConnections: false,
};

/**
 * Shared bulk-paste apply: POST → fold the committed payloads via `onResult` →
 * success toast. Used by both the paste dialog and the CTRL+V hotkey so the
 * apply/toast logic stays in one place. Failures already toast inside the
 * client wrapper, so callers only need the boolean.
 *
 * @returns `true` when the paste committed, `false` on error.
 */
export async function applySignaturePaste(args: {
  mapId: string;
  mapSystemId: string;
  rows: ParsedSigRow[];
  /** Defaults to `FAST_PASTE_OPTIONS` (add + update, no remove). */
  options?: BulkPasteOptions;
  onResult: (payloads: MapEventPayload[]) => void;
}): Promise<boolean> {
  const result = await pasteSignaturesOnServer({
    mapId: args.mapId,
    body: {
      mapSystemId: args.mapSystemId,
      rows: args.rows,
      options: args.options ?? FAST_PASTE_OPTIONS,
    },
  });
  if (!result.ok) return false;
  args.onResult(result.data.payloads);
  const { added, updated, removed, connectionsRemoved } = result.data.summary;
  toast.success(
    `Paste applied: ${added} added, ${updated} updated, ${removed} removed` +
      (connectionsRemoved ? `, ${connectionsRemoved} connections removed` : '') +
      '.',
  );
  return true;
}
