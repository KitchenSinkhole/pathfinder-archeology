'use client';

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WormholeTypeSelect } from './WormholeTypeSelect';
import type { MapSignature, MapSystemNode } from '@/types';
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
 * Signature table + create form for the selected system. Presentational —
 * mutation callbacks are owned by `InspectorModule` and ultimately by
 * `MapCanvas` (which wraps them with optimistic apply / reconcile).
 */
export function SignatureModule({
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
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted-foreground">Signatures</div>

      <div className="overflow-hidden rounded-md ring-1 ring-foreground/10">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-1.5 py-1 text-left">Sig</th>
              <th className="px-1.5 py-1 text-left">Type</th>
              <th className="px-1.5 py-1 text-left">Name</th>
              <th className="px-1.5 py-1 text-left">TTL</th>
              <th className="px-1.5 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-1.5 py-2 text-center text-muted-foreground">
                  No signatures.
                </td>
              </tr>
            )}
            {rows.map((sig) => (
              <tr key={sig.id} className="border-t border-foreground/10">
                <td className="px-1.5 py-1 font-mono">{sig.sigId}</td>
                <td className="px-1.5 py-1">
                  <WormholeTypeSelect
                    mapId={mapId}
                    universeSystemId={system.systemId}
                    value={sig.typeId}
                    onValueChange={(typeId) => onPatch(sig.id, { typeId })}
                  />
                </td>
                <td className="px-1.5 py-1">
                  <Input
                    value={sig.name ?? ''}
                    onChange={(e) => onPatch(sig.id, { name: e.target.value || null })}
                    className="h-6 text-xs"
                    placeholder="—"
                  />
                </td>
                <td className="px-1.5 py-1 text-muted-foreground">{formatRelativeIso(sig.expiresAt)}</td>
                <td className="px-1.5 py-1 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete signature"
                    onClick={() => onDelete(sig.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-1.5">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Sig</span>
          <Input
            value={draftSigId}
            onChange={(e) => setDraftSigId(e.target.value.toUpperCase())}
            className="h-7 w-16 font-mono text-xs"
            placeholder="ABC"
            maxLength={7}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Name</span>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-7 text-xs"
            placeholder="optional"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Type</span>
          <div className="w-28">
            <WormholeTypeSelect
              mapId={mapId}
              universeSystemId={system.systemId}
              value={draftTypeId}
              onValueChange={setDraftTypeId}
            />
          </div>
        </div>
        <Button type="button" size="sm" onClick={submit} disabled={draftSigId.trim().length === 0}>
          Add
        </Button>
      </div>
    </div>
  );
}
