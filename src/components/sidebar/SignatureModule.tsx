'use client';

import { useMemo, useState } from 'react';
import { ClipboardPaste, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WormholeTypeSelect } from './WormholeTypeSelect';
import { SignaturePasteDialog } from '@/components/dialogs/SignaturePasteDialog';
import type { MapEventPayload, MapSignature, MapSystemNode } from '@/types';
import type {
  CreateSignatureBody,
  UpdateSignatureBody,
} from '@/lib/map/client';
import { formatRelativeFromMs } from '@/lib/map/relativeTime';
import { apertureConfig } from '../../../aperture.config';

function defaultExpiry(): string {
  return new Date(Date.now() + apertureConfig.SIGNATURE_DEFAULT_TTL_MS).toISOString();
}

function formatRelativeIso(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  return formatRelativeFromMs(ts - Date.now());
}

/**
 * Standalone Signatures panel rendered below the map. Presentational —
 * mutation callbacks are owned by `MapCanvas` (which wraps them with
 * optimistic apply / reconcile). Renders an empty state when no system is
 * selected.
 */
export function SignatureModule({
  mapId,
  system,
  signatures,
  onCreate,
  onPatch,
  onDelete,
  onBulkPaste,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
  onBulkPaste: (payloads: MapEventPayload[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">
          Signatures{system ? ` — ${system.alias ?? system.name}` : ''}
        </CardTitle>
        {system && (
          <SignaturePasteButton
            mapId={mapId}
            system={system}
            signatures={signatures}
            onBulkPaste={onBulkPaste}
          />
        )}
      </CardHeader>
      <CardContent>
        {!system ? (
          <p className="text-xs text-muted-foreground">
            Select a system on the map to view its signatures.
          </p>
        ) : (
          <SignaturePanelBody
            key={system.id}
            mapId={mapId}
            system={system}
            signatures={signatures}
            onCreate={onCreate}
            onPatch={onPatch}
            onDelete={onDelete}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SignaturePasteButton({
  mapId,
  system,
  signatures,
  onBulkPaste,
}: {
  mapId: string;
  system: MapSystemNode;
  signatures: MapSignature[];
  onBulkPaste: (payloads: MapEventPayload[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => signatures.filter((s) => s.mapSystemId === system.id),
    [signatures, system.id],
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ClipboardPaste className="size-3.5" />
        Paste from scanner
      </Button>
      <SignaturePasteDialog
        open={open}
        onOpenChange={setOpen}
        mapId={mapId}
        mapSystemId={system.id}
        existingSigs={rows}
        onResult={onBulkPaste}
      />
    </>
  );
}

function SignaturePanelBody({
  mapId,
  system,
  signatures,
  onCreate,
  onPatch,
  onDelete,
}: {
  mapId: string;
  system: MapSystemNode;
  signatures: MapSignature[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
}) {
  const rows = useMemo(
    () => signatures.filter((s) => s.mapSystemId === system.id),
    [signatures, system.id],
  );

  const [draftSigId, setDraftSigId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftTypeId, setDraftTypeId] = useState<number | null>(null);

  function submit() {
    if (draftSigId.trim().length === 0) return;
    onCreate({
      mapSystemId: system.id,
      sigId: draftSigId.trim().toUpperCase(),
      name: draftName.trim() || null,
      typeId: draftTypeId,
      expiresAt: defaultExpiry(),
    });
    setDraftSigId('');
    setDraftName('');
    setDraftTypeId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-24 px-3 py-2 text-left">Sig</th>
              <th className="w-56 px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="w-28 px-3 py-2 text-left">TTL</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  No signatures.
                </td>
              </tr>
            )}
            {rows.map((sig) => (
              <tr key={sig.id} className="border-t border-foreground/10">
                <td className="px-3 py-1.5 font-mono text-xs">{sig.sigId}</td>
                <td className="px-3 py-1.5">
                  <WormholeTypeSelect
                    mapId={mapId}
                    universeSystemId={system.systemId}
                    value={sig.typeId}
                    onValueChange={(typeId) => onPatch(sig.id, { typeId })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={sig.name ?? ''}
                    onChange={(e) => onPatch(sig.id, { name: e.target.value || null })}
                    className="h-7 text-sm"
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {formatRelativeIso(sig.expiresAt)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete signature"
                    onClick={() => onDelete(sig.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Sig</span>
          <Input
            value={draftSigId}
            onChange={(e) => setDraftSigId(e.target.value.toUpperCase())}
            className="h-8 w-20 font-mono"
            placeholder="ABC"
            maxLength={7}
          />
        </div>
        <div className="flex w-56 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Type</span>
          <WormholeTypeSelect
            mapId={mapId}
            universeSystemId={system.systemId}
            value={draftTypeId}
            onValueChange={setDraftTypeId}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Name</span>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-8"
            placeholder="optional"
          />
        </div>
        <Button type="button" onClick={submit} disabled={draftSigId.trim().length === 0}>
          Add
        </Button>
      </div>
    </div>
  );
}
