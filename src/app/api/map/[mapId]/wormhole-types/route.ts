import 'server-only';
import { type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { wormholeTypesForSystem } from '@/lib/map/wormholeTypes';
import { guardMap } from '../../utils';

/**
 * GET /api/map/[mapId]/wormhole-types?systemId=<universeSystemId>
 * Returns wormhole type options filtered to the given system's class — fed by
 * the wormhole-type dropdown in the signature inspector (SPEC §6.4).
 *
 * INTERIM ACCESS: any logged-in character may call this. Stage 15 adds per-map rights.
 */

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
) {
  const session = await getSession();
  if (!session?.characterId) return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  const { mapId: rawMapId } = await params;
  const guard = await guardMap(rawMapId);
  if (!guard) return Response.json({ ok: false, error: 'Map not found.' }, { status: 404 });

  const rawSystemId = request.nextUrl.searchParams.get('systemId');
  if (!rawSystemId || !/^\d+$/.test(rawSystemId)) {
    return Response.json({ ok: false, error: 'systemId query param required.' }, { status: 400 });
  }
  const systemId = Number(rawSystemId);
  if (!Number.isInteger(systemId) || systemId <= 0) {
    return Response.json({ ok: false, error: 'Invalid systemId.' }, { status: 400 });
  }

  const types = await wormholeTypesForSystem(systemId);
  return Response.json({ ok: true, data: types });
}
