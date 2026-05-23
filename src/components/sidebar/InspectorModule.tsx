'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { connectionTimeLeftMs } from '@/lib/map/connectionState';
import { formatRelativeFromMs } from '@/lib/map/relativeTime';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignatureModule } from './SignatureModule';
import type {
  MapConnectionEdge,
  MapSignature,
  MapSystemNode,
  MapViewData,
} from '@/types';
import type {
  CreateSignatureBody,
  UpdateConnectionBody,
  UpdateSignatureBody,
  UpdateSystemBody,
} from '@/lib/map/client';
import {
  CONNECTION_SCOPES,
  SYSTEM_STATUSES,
  WH_JUMP_MASSES,
  WH_MASSES,
  type ConnectionScope,
  type SystemStatus,
  type WhJumpMass,
  type WhMass,
} from '@/lib/map/enumLabels';

const NONE_JUMP_MASS = '__none__';

export type SelectionRef =
  | { kind: 'system'; id: string }
  | { kind: 'connection'; id: string };

export function InspectorModule(props: {
  mapId: string;
  selected: SelectionRef | null;
  viewData: MapViewData;
  onSystemPatch: (mapSystemId: string, patch: UpdateSystemBody) => void;
  onSystemRemove: (mapSystemId: string) => void;
  onConnectionPatch: (connectionId: string, patch: UpdateConnectionBody) => void;
  onConnectionDelete: (connectionId: string) => void;
  onSignatureCreate: (body: CreateSignatureBody) => void;
  onSignaturePatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onSignatureDelete: (signatureId: string) => void;
}) {
  const { selected, viewData } = props;

  if (!selected) return <EmptyInspector />;

  if (selected.kind === 'system') {
    const system = viewData.systems.find((s) => s.id === selected.id);
    if (!system) return <EmptyInspector />;
    return (
      <SystemInspector
        key={system.id}
        mapId={props.mapId}
        system={system}
        signatures={viewData.signatures}
        onPatch={(patch) => props.onSystemPatch(system.id, patch)}
        onRemove={() => props.onSystemRemove(system.id)}
        onSignatureCreate={props.onSignatureCreate}
        onSignaturePatch={props.onSignaturePatch}
        onSignatureDelete={props.onSignatureDelete}
      />
    );
  }

  const connection = viewData.connections.find((c) => c.id === selected.id);
  if (!connection) return <EmptyInspector />;
  return (
    <ConnectionInspector
      connection={connection}
      onPatch={(patch) => props.onConnectionPatch(connection.id, patch)}
      onDelete={() => props.onConnectionDelete(connection.id)}
    />
  );
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

function EmptyInspector() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Inspector</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Select a system or connection to edit.
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

function SystemInspector({
  mapId,
  system,
  signatures,
  onPatch,
  onRemove,
  onSignatureCreate,
  onSignaturePatch,
  onSignatureDelete,
}: {
  mapId: string;
  system: MapSystemNode;
  signatures: MapSignature[];
  onPatch: (patch: UpdateSystemBody) => void;
  onRemove: () => void;
  onSignatureCreate: (body: CreateSignatureBody) => void;
  onSignaturePatch: (signatureId: string, patch: UpdateSignatureBody) => void;
  onSignatureDelete: (signatureId: string) => void;
}) {
  // `intelNotes` isn't part of `MapViewData`; we keep a local draft that's
  // committed on blur so PATCHes don't fire per keystroke. The parent renders
  // this component with `key={system.id}` so the draft naturally resets when
  // the selected system changes.
  const [intelDraft, setIntelDraft] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{system.alias ?? system.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs">
        <Row label="Status">
          <Select<string>
            value={system.status}
            onValueChange={(v) => v && onPatch({ status: v as SystemStatus })}
            items={Object.fromEntries(SYSTEM_STATUSES.map((s) => [s, s]))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYSTEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Alias">
          <Input
            value={system.alias ?? ''}
            onChange={(e) => onPatch({ alias: e.target.value || null })}
            className="h-7"
            placeholder={system.name}
          />
        </Row>

        <Row label="Tag">
          <Input
            value={system.tag ?? ''}
            onChange={(e) => onPatch({ tag: e.target.value || null })}
            className="h-7"
            placeholder="—"
            maxLength={50}
          />
        </Row>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Intel notes</span>
          <textarea
            value={intelDraft}
            onChange={(e) => setIntelDraft(e.target.value)}
            onBlur={() => {
              if (intelDraft.length > 0) {
                onPatch({ intelNotes: intelDraft });
                setIntelDraft('');
              }
            }}
            placeholder="Notes are committed on blur."
            className="h-20 resize-none rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={system.locked}
              onChange={(e) => onPatch({ locked: e.target.checked })}
            />
            <span>Locked</span>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPatch({ rallyAt: new Date().toISOString() })}
          >
            Set rally
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPatch({ rallyAt: null })}
          >
            Clear rally
          </Button>
        </div>

        <SignatureModule
          mapId={mapId}
          system={system}
          signatures={signatures}
          onCreate={onSignatureCreate}
          onPatch={onSignaturePatch}
          onDelete={onSignatureDelete}
        />

        <div className="flex justify-end">
          <Button type="button" variant="destructive" size="sm" onClick={onRemove} className="gap-1.5">
            <Trash2 className="size-3.5" />
            Remove from map
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function ConnectionInspector({
  connection,
  onPatch,
  onDelete,
}: {
  connection: MapConnectionEdge;
  onPatch: (patch: UpdateConnectionBody) => void;
  onDelete: () => void;
}) {
  const jumpMassValue = connection.jumpMassClass ?? NONE_JUMP_MASS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Connection</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs">
        <Row label="Scope">
          <Select<string>
            value={connection.scope}
            onValueChange={(v) => v && onPatch({ scope: v as ConnectionScope })}
            items={Object.fromEntries(CONNECTION_SCOPES.map((s) => [s, s]))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONNECTION_SCOPES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Mass">
          <Select<string>
            value={connection.massStatus}
            onValueChange={(v) => v && onPatch({ massStatus: v as WhMass })}
            items={Object.fromEntries(WH_MASSES.map((s) => [s, s]))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WH_MASSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row label="Jump mass">
          <Select<string>
            value={jumpMassValue}
            onValueChange={(v) =>
              onPatch({ jumpMassClass: v === NONE_JUMP_MASS ? null : (v as WhJumpMass) })
            }
            items={{
              [NONE_JUMP_MASS]: 'unknown',
              ...Object.fromEntries(WH_JUMP_MASSES.map((s) => [s, s.toUpperCase()])),
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_JUMP_MASS}>unknown</SelectItem>
              {WH_JUMP_MASSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <div className="grid grid-cols-2 gap-2">
          <ConnFlag label="EOL" checked={connection.isEol} onChange={(v) => onPatch({ isEol: v })} />
          <ConnFlag
            label="Frigate"
            checked={connection.isFrigate}
            onChange={(v) => onPatch({ isFrigate: v })}
          />
          <ConnFlag
            label="Preserve mass"
            checked={connection.preserveMass}
            onChange={(v) => onPatch({ preserveMass: v })}
          />
          <ConnFlag
            label="Rolling"
            checked={connection.isRolling}
            onChange={(v) => onPatch({ isRolling: v })}
          />
        </div>

        <ConnectionExpiryHint connection={connection} />

        <div className="flex justify-end">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete} className="gap-1.5">
            <Trash2 className="size-3.5" />
            Delete connection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectionExpiryHint({ connection }: { connection: MapConnectionEdge }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const ms = connectionTimeLeftMs(connection, now);
  if (ms === null) return null;
  const label = connection.isEol ? 'EOL expires in' : 'Expires in';
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium tabular-nums text-foreground">{formatRelativeFromMs(ms)}</span>
    </div>
  );
}

function ConnFlag({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
