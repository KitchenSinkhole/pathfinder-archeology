'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseSignaturePaste } from '@/lib/map/signatureParser';
import { applySignaturePaste } from '@/lib/map/applySignaturePaste';
import { usePresenceStore } from './MapPresenceContext';
import type { MapEventPayload, MapSystemNode, ParsedSigRow } from '@/types';

/**
 * Fast-scanning CTRL+V: a document-level `paste` listener that applies in-game
 * probe-scanner clipboard data straight to the selected system via the bulk
 * endpoint — skipping the `SignaturePasteDialog`. The paste applies directly
 * only when one of the viewer's pilots is confirmed to be *in* the selected
 * system; otherwise a confirm dialog gates the apply (this covers both "your
 * pilot is in a different system" and "none of your pilots is located here").
 *
 * Must be rendered inside `MapPresenceProvider` so it can read live presence.
 */
export function SignaturePasteHotkey({
  mapId,
  selectedSystem,
  systems,
  viewerCharacterIds,
  onBulkPaste,
}: {
  mapId: string;
  selectedSystem: MapSystemNode | null;
  systems: MapSystemNode[];
  viewerCharacterIds: number[];
  onBulkPaste: (payloads: MapEventPayload[]) => void;
}) {
  const store = usePresenceStore();

  const [confirm, setConfirm] = useState<{
    rows: ParsedSigRow[];
    targetSystem: MapSystemNode;
    /** Name of a system one of the viewer's pilots is in, or null if none are located. */
    locationName: string | null;
  } | null>(null);

  // The paste listener is registered once; it reads the latest props/state
  // through this ref so a selection or location change doesn't re-subscribe.
  // The ref is updated in an effect (not during render) — same pattern as
  // `useTraversals` in MapPresenceContext.
  const latest = useRef({ mapId, selectedSystem, systems, viewerCharacterIds, store, onBulkPaste });
  useEffect(() => {
    latest.current = { mapId, selectedSystem, systems, viewerCharacterIds, store, onBulkPaste };
  });

  const apply = useCallback((rows: ParsedSigRow[], targetSystem: MapSystemNode) => {
    const { mapId, onBulkPaste } = latest.current;
    void applySignaturePaste({
      mapId,
      mapSystemId: targetSystem.id,
      rows,
      onResult: onBulkPaste,
    });
  }, []);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isEditable(e.target)) return; // user is typing into a field — leave native paste alone
      const text = e.clipboardData?.getData('text') ?? '';
      if (!text) return;
      const rows = parseSignaturePaste(text);
      if (rows.length === 0) return; // not scanner data — don't hijack the paste
      e.preventDefault();

      const { selectedSystem, systems, viewerCharacterIds, store } = latest.current;
      if (!selectedSystem) {
        toast.info('Select a system on the map to paste scanned signatures into it.');
        return;
      }

      // The EVE solar-system ids the viewer's pilots are currently located in
      // (read live off the stable store instance).
      const myLocations = viewerCharacterIds
        .map((id) => store?.getSystemForCharacter(id) ?? null)
        .filter((s): s is number => s !== null);

      if (myLocations.includes(selectedSystem.systemId)) {
        apply(rows, selectedSystem); // a pilot is in the selected system — fast path
        return;
      }

      // No pilot here: confirm. Name a system a pilot *is* in, when we know one.
      const elsewhere = myLocations[0] ?? null;
      const onMap = elsewhere === null ? undefined : systems.find((s) => s.systemId === elsewhere);
      const locationName =
        elsewhere === null
          ? null
          : onMap
            ? (onMap.alias ?? onMap.name)
            : 'another system (not on this map)';
      setConfirm({ rows, targetSystem: selectedSystem, locationName });
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [apply]);

  const targetName = confirm ? (confirm.targetSystem.alias ?? confirm.targetSystem.name) : '';

  return (
    <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Location doesn&apos;t match</DialogTitle>
          <DialogDescription>
            {confirm?.locationName
              ? `Your pilot is in ${confirm.locationName}, but the selected system is ${targetName}. Apply the scanned signatures to ${targetName} anyway?`
              : `None of your characters is in ${targetName}. Apply the scanned signatures there anyway?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (confirm) apply(confirm.rows, confirm.targetSystem);
              setConfirm(null);
            }}
          >
            Apply anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}
