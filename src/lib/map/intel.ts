import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  universeFactionWarSystem,
  universeSovereigntyMap,
  universeSystem,
} from '@/db/schema';
import {
  anoikSystemUrl,
  ccpImageUrl,
  dotlanSystemUrl,
  eveeyeSystemUrl,
  zkillboardSystemUrl,
} from '@/lib/integrations/links';
import {
  connectionsForSystem,
  fetchEveScoutConnections,
  type EveScoutConnectionSummary,
} from '@/lib/integrations/evescout';
import { recentKillsForSystem, type RecentKillSummary } from '@/lib/integrations/zkb';

export type SovereigntyIntel = {
  factionId: string | null;
  allianceId: string | null;
  corporationId: string | null;
  allianceImage: string | null;
  corporationImage: string | null;
};

export type FactionWarIntel = {
  ownerFactionId: string | null;
  occupierFactionId: string | null;
  contested: string | null;
  victoryPoints: number | null;
  victoryPointsThreshold: number | null;
};

export type SystemExternalLinks = {
  dotlan: string;
  eveeye: string;
  anoik: string;
  zkillboard: string;
};

export type SystemIntelSummary = {
  sovereignty: SovereigntyIntel | null;
  factionWar: FactionWarIntel | null;
  recentKills: RecentKillSummary[];
  scoutConnections: EveScoutConnectionSummary[];
  links: SystemExternalLinks;
};

export async function intelForSystems(systemIds: number[]): Promise<Record<number, SystemIntelSummary>> {
  if (systemIds.length === 0) return {};
  const systems = await db
    .select({ id: universeSystem.id, name: universeSystem.name })
    .from(universeSystem)
    .where(inArray(universeSystem.id, systemIds));
  const [sovRows, fwRows, scoutRows] = await Promise.all([
    loadSov(systemIds),
    loadFw(systemIds),
    safeScoutConnections(),
  ]);

  const out: Record<number, SystemIntelSummary> = {};
  await Promise.all(
    systems.map(async (system) => {
      out[system.id] = {
        sovereignty: sovRows.get(system.id) ?? null,
        factionWar: fwRows.get(system.id) ?? null,
        recentKills: await safeRecentKills(system.id),
        scoutConnections: connectionsForSystem(scoutRows, system.id),
        links: {
          dotlan: dotlanSystemUrl(system.name),
          eveeye: eveeyeSystemUrl(system.id),
          anoik: anoikSystemUrl(system.name),
          zkillboard: zkillboardSystemUrl(system.id),
        },
      };
    }),
  );
  return out;
}

async function loadSov(systemIds: number[]): Promise<Map<number, SovereigntyIntel>> {
  const rows = await db
    .select()
    .from(universeSovereigntyMap)
    .where(inArray(universeSovereigntyMap.systemId, systemIds));
  return new Map(
    rows.map((r) => [
      r.systemId,
      {
        factionId: r.factionId?.toString() ?? null,
        allianceId: r.allianceId?.toString() ?? null,
        corporationId: r.corporationId?.toString() ?? null,
        allianceImage: r.allianceId ? ccpImageUrl('alliances', r.allianceId, 'logo', 64) : null,
        corporationImage: r.corporationId ? ccpImageUrl('corporations', r.corporationId, 'logo', 64) : null,
      },
    ]),
  );
}

async function loadFw(systemIds: number[]): Promise<Map<number, FactionWarIntel>> {
  const rows = await db
    .select()
    .from(universeFactionWarSystem)
    .where(inArray(universeFactionWarSystem.systemId, systemIds));
  return new Map(
    rows.map((r) => [
      r.systemId,
      {
        ownerFactionId: r.ownerFactionId?.toString() ?? null,
        occupierFactionId: r.occupierFactionId?.toString() ?? null,
        contested: r.contested,
        victoryPoints: r.victoryPoints,
        victoryPointsThreshold: r.victoryPointsThreshold,
      },
    ]),
  );
}

async function safeScoutConnections(): Promise<EveScoutConnectionSummary[]> {
  try {
    return await fetchEveScoutConnections();
  } catch {
    return [];
  }
}

async function safeRecentKills(systemId: number): Promise<RecentKillSummary[]> {
  try {
    return await recentKillsForSystem(systemId, 5);
  } catch {
    return [];
  }
}
