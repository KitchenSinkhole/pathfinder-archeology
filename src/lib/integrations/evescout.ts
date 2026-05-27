import { z } from 'zod';
import { apertureConfig } from '../../../aperture.config';

const EVESCOUT_BASE = 'https://api.eve-scout.com/v2/public';

export const eveScoutConnectionSchema = z
  .object({
    system_source: z.string(),
    system_source_id: z.coerce.number().int().optional(),
    system_target: z.string(),
    system_target_id: z.coerce.number().int().optional(),
    signature_id: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
  })
  .passthrough();

const errorEnvelopeSchema = z.object({ error: z.string() });
export const eveScoutConnectionsSchema = z.array(eveScoutConnectionSchema);

export type EveScoutConnectionRaw = z.infer<typeof eveScoutConnectionSchema>;
export type EveScoutConnectionSummary = {
  sourceName: string;
  sourceSystemId: number | null;
  targetName: string;
  targetSystemId: number | null;
  signatureId: string | null;
  hub: 'Thera' | 'Turnur' | 'Unknown';
  updatedAt: string | null;
  expiresAt: string | null;
};

export class EveScoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EveScoutError';
  }
}

export async function fetchEveScoutConnections(): Promise<EveScoutConnectionSummary[]> {
  const res = await fetch(`${EVESCOUT_BASE}/signatures`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(apertureConfig.INTEGRATION_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new EveScoutError(`EVE-Scout request failed: ${res.status}`);

  const json = await res.json();
  const error = errorEnvelopeSchema.safeParse(json);
  if (error.success) throw new EveScoutError(error.data.error);

  return eveScoutConnectionsSchema.parse(json).map((row) => ({
    sourceName: row.system_source,
    sourceSystemId: row.system_source_id ?? null,
    targetName: row.system_target,
    targetSystemId: row.system_target_id ?? null,
    signatureId: row.signature_id ?? null,
    hub: classifyHub(row.system_source, row.system_target),
    updatedAt: row.updated_at ?? row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
  }));
}

export function connectionsForSystem(
  rows: readonly EveScoutConnectionSummary[],
  systemId: number,
): EveScoutConnectionSummary[] {
  return rows.filter((row) => row.sourceSystemId === systemId || row.targetSystemId === systemId);
}

function classifyHub(source: string, target: string): EveScoutConnectionSummary['hub'] {
  const text = `${source} ${target}`.toLowerCase();
  if (text.includes('thera')) return 'Thera';
  if (text.includes('turnur')) return 'Turnur';
  return 'Unknown';
}
