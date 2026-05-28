'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WormholeTypeSelect } from './WormholeTypeSelect';
import { SignatureGroupSelect } from './SignatureGroupSelect';
import { ConnectionSelect } from './ConnectionSelect';
import { SignaturePasteDialog } from '@/components/dialogs/SignaturePasteDialog';
import type {
  MapConnectionEdge,
  MapEventPayload,
  MapSignature,
  MapSystemNode,
  SignatureGroupKey,
} from '@/types';
import type {
  CreateSignatureBody,
  UpdateSignatureBody,
} from '@/lib/map/client';
import { labelForSignatureGroupKey } from '@/lib/map/signatureGroups';
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
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
  onBulkPaste,
}: {
  mapId: string;
  system: MapSystemNode | null;
  signatures: MapSignature[];
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
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
            connections={connections}
            systems={systems}
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
  connections,
  systems,
  onCreate,
  onPatch,
  onDelete,
}: {
  mapId: string;
  system: MapSystemNode;
  signatures: MapSignature[];
  connections: MapConnectionEdge[];
  systems: MapSystemNode[];
  onCreate: (body: CreateSignatureBody) => void;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onDelete: (signatureId: string) => void;
}) {
  const rows = useMemo(
    () => signatures.filter((s) => s.mapSystemId === system.id),
    [signatures, system.id],
  );

  const [draftSigId, setDraftSigId] = useState('');
  const [draftGroupKey, setDraftGroupKey] = useState<SignatureGroupKey | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftTypeId, setDraftTypeId] = useState<number | null>(null);
  const [draftConnectionId, setDraftConnectionId] = useState<string | null>(null);

  function submit() {
    if (draftSigId.trim().length === 0) return;
    const isWh = draftGroupKey === 'wormhole';
    onCreate({
      mapSystemId: system.id,
      sigId: draftSigId.trim().toUpperCase(),
      groupKey: draftGroupKey,
      typeId: isWh ? draftTypeId : null,
      name: isWh ? null : (draftName.trim() || null),
      mapConnectionId: isWh ? draftConnectionId : null,
      expiresAt: defaultExpiry(),
    });
    setDraftSigId('');
    setDraftGroupKey(null);
    setDraftName('');
    setDraftTypeId(null);
    setDraftConnectionId(null);
  }

  /**
   * Build a Group-change patch including the cascading nulls. Always clears
   * `typeId` and `name`; clears `mapConnectionId` when the previous row was a
   * wormhole and the new group isn't (or vice versa, since the connection is
   * only valid for wormhole sigs).
   */
  function buildGroupChangePatch(
    prev: MapSignature,
    nextKey: SignatureGroupKey | null,
  ): UpdateSignatureBody {
    const patch: UpdateSignatureBody = {
      groupKey: nextKey,
      typeId: null,
      name: null,
    };
    const wasWormhole = prev.groupKey === 'wormhole';
    const isWormhole = nextKey === 'wormhole';
    if (wasWormhole !== isWormhole) patch.mapConnectionId = null;
    return patch;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-24 px-3 py-2 text-left">Sig</th>
              <th className="w-32 px-3 py-2 text-left">Group</th>
              <th className="w-56 px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="w-44 px-3 py-2 text-left">Leads to</th>
              <th className="w-20 px-3 py-2 text-left">TTL</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  No signatures.
                </td>
              </tr>
            )}
            {rows.map((sig) => (
              <tr key={sig.id} className="border-t border-foreground/10 align-middle">
                <td className="px-3 py-1.5 font-mono text-xs">{sig.sigId}</td>
                <td className="px-3 py-1.5">
                  <SignatureGroupSelect
                    value={sig.groupKey}
                    onValueChange={(nextKey) =>
                      onPatch(sig.id, buildGroupChangePatch(sig, nextKey))
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <TypeCell
                    mapId={mapId}
                    system={system}
                    sig={sig}
                    onPatch={onPatch}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <EditableTextCell
                    value={sig.description ?? ''}
                    onCommit={(next) => onPatch(sig.id, { description: next || null })}
                    className="h-7 text-sm"
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <ConnectionSelect
                    system={system}
                    connections={connections}
                    systems={systems}
                    value={sig.mapConnectionId}
                    onValueChange={(next) =>
                      onPatch(sig.id, { mapConnectionId: next })
                    }
                    disabled={sig.groupKey !== 'wormhole'}
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
        <div className="flex w-32 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Group</span>
          <SignatureGroupSelect
            value={draftGroupKey}
            onValueChange={(next) => {
              setDraftGroupKey(next);
              setDraftTypeId(null);
              setDraftName('');
              setDraftConnectionId(null);
            }}
          />
        </div>
        <div className="flex w-56 flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Type</span>
          {draftGroupKey === 'wormhole' ? (
            <WormholeTypeSelect
              mapId={mapId}
              universeSystemId={system.systemId}
              value={draftTypeId}
              onValueChange={setDraftTypeId}
            />
          ) : (
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8"
              placeholder={draftGroupKey ? 'Site name' : 'Pick a group first'}
              disabled={draftGroupKey === null}
            />
          )}
        </div>
        {draftGroupKey === 'wormhole' && (
          <div className="flex w-44 flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Leads to</span>
            <ConnectionSelect
              system={system}
              connections={connections}
              systems={systems}
              value={draftConnectionId}
              onValueChange={setDraftConnectionId}
            />
          </div>
        )}
        <Button type="button" onClick={submit} disabled={draftSigId.trim().length === 0}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Row Type cell, cascaded on Group:
 *   - `wormhole` → `WormholeTypeSelect` (writes `typeId`; mirrors the WH code to `name`).
 *   - cosmic groups (Combat/Relic/Data/Gas/Ore/Ghost) → free-form site name input (writes `name`).
 *   - null group → disabled placeholder.
 */
function TypeCell({
  mapId,
  system,
  sig,
  onPatch,
}: {
  mapId: string;
  system: MapSystemNode;
  sig: MapSignature;
  onPatch: (signatureId: string, patch: UpdateSignatureBody) => void;
}) {
  if (sig.groupKey === null) {
    return (
      <div className="text-xs text-muted-foreground italic">Pick a group first</div>
    );
  }
  if (sig.groupKey === 'wormhole') {
    return (
      <WormholeTypeSelect
        mapId={mapId}
        universeSystemId={system.systemId}
        value={sig.typeId}
        onValueChange={(typeId) =>
          // Mirror the resolved WH code to `name` so the cell displays the
          // code even without a fresh load; loadMap re-derives it via the
          // `universe_wormhole` join (`wormholeCode`).
          onPatch(sig.id, { typeId, name: null })
        }
      />
    );
  }
  // Free-form cosmic site name. Controlled draft + commit-on-blur avoids
  // per-keystroke PATCHes while sidestepping Base UI's "uncontrolled
  // FieldControl default value changed" warning when the optimistic apply
  // updates `sig.name` after blur.
  const placeholder = labelForSignatureGroupKey(sig.groupKey) ?? 'Site name';
  return (
    <EditableTextCell
      value={sig.name ?? ''}
      onCommit={(next) => onPatch(sig.id, { name: next || null })}
      className="h-7 text-sm"
      placeholder={`${placeholder} site`}
    />
  );
}

/**
 * Controlled text input that commits on blur. Keeps a local draft so each
 * keystroke isn't a PATCH, and re-syncs from `value` when the input isn't
 * focused (so external updates — optimistic apply, realtime — don't clobber
 * mid-edit typing).
 */
function EditableTextCell({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const next = draft.trim();
        if (next !== draft) setDraft(next);
        if (value !== next) onCommit(next);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
}
