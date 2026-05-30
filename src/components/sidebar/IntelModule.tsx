'use client';

import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MapSystemNode } from '@/lib/map/loadMap';
import type { SystemIntelSummary } from '@/lib/map/intel';

export function IntelModule({
  system,
  intel,
}: {
  system: MapSystemNode | null;
  intel: SystemIntelSummary | undefined;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Intel</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-xs">
        {!system ? (
          <p className="text-muted-foreground">Select a system to see intel.</p>
        ) : (
          <>
            <SystemMeta system={system} />
            <SovereigntyBlock intel={intel} />
            <FactionWarBlock intel={intel} />
            <ScoutBlock intel={intel} />
            {intel ? <ExternalLinks links={intel.links} /> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SystemMeta({ system }: { system: MapSystemNode }) {
  return (
    <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1">
      <dt className="text-muted-foreground">Region</dt>
      <dd>{system.regionName}</dd>
      <dt className="text-muted-foreground">Const.</dt>
      <dd>{system.constellationName}</dd>
      <dt className="text-muted-foreground">Security</dt>
      <dd>{system.security ?? 'unknown'}</dd>
      {system.effect ? (
        <>
          <dt className="text-muted-foreground">Effect</dt>
          <dd>{system.effect}</dd>
        </>
      ) : null}
    </dl>
  );
}

function SovereigntyBlock({ intel }: { intel: SystemIntelSummary | undefined }) {
  const sov = intel?.sovereignty;
  if (!sov) return <p className="text-muted-foreground">No sovereignty data.</p>;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground">Sovereignty</span>
      <div className="flex items-center gap-2">
        {sov.allianceImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sov.allianceImage} alt="" className="size-6 rounded-sm" />
        ) : sov.corporationImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sov.corporationImage} alt="" className="size-6 rounded-sm" />
        ) : null}
        <span className="font-mono text-muted-foreground">
          {sov.allianceId
            ? `Alliance ${sov.allianceId}`
            : sov.corporationId
              ? `Corp ${sov.corporationId}`
              : sov.factionId
                ? `Faction ${sov.factionId}`
                : 'unclaimed'}
        </span>
      </div>
    </div>
  );
}

function FactionWarBlock({ intel }: { intel: SystemIntelSummary | undefined }) {
  const fw = intel?.factionWar;
  if (!fw) return null;
  const victory =
    fw.victoryPoints !== null && fw.victoryPointsThreshold
      ? `${Math.round((fw.victoryPoints / fw.victoryPointsThreshold) * 100)}%`
      : null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground">Faction Warfare</span>
      <span className="font-mono text-muted-foreground">
        {fw.occupierFactionId ? `Occupier ${fw.occupierFactionId}` : 'No occupier'}
        {fw.contested ? ` / ${fw.contested}` : ''}
        {victory ? ` / ${victory}` : ''}
      </span>
    </div>
  );
}

function ScoutBlock({ intel }: { intel: SystemIntelSummary | undefined }) {
  const rows = intel?.scoutConnections ?? [];
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground">EVE-Scout</span>
      {rows.length === 0 ? (
        <span className="text-muted-foreground">No Thera / Turnur hits.</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.slice(0, 3).map((row, idx) => (
            <li key={`${row.sourceName}-${row.targetName}-${idx}`} className="flex justify-between gap-2">
              <span>{row.hub}</span>
              <span className="truncate text-muted-foreground">
                {row.sourceName} to {row.targetName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExternalLinks({ links }: { links: SystemIntelSummary['links'] }) {
  const items = [
    ['DOTLAN', links.dotlan],
    ['EVEEYE', links.eveeye],
    ['Anoik', links.anoik],
    ['zKill', links.zkillboard],
  ] as const;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map(([label, href]) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent"
        >
          {label}
          <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}
