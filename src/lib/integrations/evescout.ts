import { z } from 'zod';
import { apertureConfig } from '../../../aperture.config';

const EVESCOUT_BASE = 'https://api.eve-scout.com/v2/public';

// EVE-Scout v2 `/signatures` orients every row from the shattered hub's
// perspective: `out_system_*` is always Thera/Turnur, `in_system_*` is the
// connected system. `out_signature`/`in_signature` are the wormhole sig ids as
// seen from each end.
export const eveScoutConnectionSchema = z
  .object({
    id: z.coerce.string().optional(),
    out_system_id: z.coerce.number().int().optional(),
    out_system_name: z.string(),
    out_signature: z.string().nullable().optional(),
    in_system_id: z.coerce.number().int().optional(),
    in_system_name: z.string(),
    in_system_class: z.string().nullable().optional(),
    in_signature: z.string().nullable().optional(),
    signature_type: z.string().nullable().optional(),
    wh_type: z.string().nullable().optional(),
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
    sourceName: row.out_system_name,
    sourceSystemId: row.out_system_id ?? null,
    targetName: row.in_system_name,
    targetSystemId: row.in_system_id ?? null,
    // The connected (in) system's sig is what a mapper records on that side.
    signatureId: row.in_signature ?? null,
    hub: classifyHub(row.out_system_name, row.in_system_name),
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
