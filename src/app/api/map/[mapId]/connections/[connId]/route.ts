import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { deleteConnection, updateConnection } from '@/lib/map/mutations/connections';
import { connectionScope, whJumpMass, whMass } from '@/db/schema/ap/enums';
import { guardMap, parseBigInt } from '../../../utils';

/**
 * PATCH /api/map/[mapId]/connections/[connId] — update a connection's flags.
 * DELETE /api/map/[mapId]/connections/[connId] — hard-delete (wormholes don't come back).
 *
 * INTERIM ACCESS: any logged-in character may call this. Stage 15 adds per-map rights.
 */

const updateConnectionBodySchema = z.object({
  scope: z.enum(connectionScope.enumValues).optional(),
  massStatus: z.enum(whMass.enumValues).optional(),
  jumpMassClass: z.enum(whJumpMass.enumValues).nullable().optional(),
  isEol: z.boolean().optional(),
  isFrigate: z.boolean().optional(),
  preserveMass: z.boolean().optional(),
  isRolling: z.boolean().optional(),
});

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string; connId: string }> },
) {
  const session = await getSession();
  if (!session?.characterId) return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  const { mapId: rawMapId, connId: rawConnId } = await params;
  const guard = await guardMap(rawMapId);
  if (!guard) return Response.json({ ok: false, error: 'Map not found.' }, { status: 404 });

  const connectionId = parseBigInt(rawConnId);
  if (!connectionId) return Response.json({ ok: false, error: 'Invalid connection id.' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = updateConnectionBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const result = await updateConnection({
    mapId: guard.mapId,
    connectionId,
    characterId: BigInt(session.characterId),
    patch: parsed.data,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ mapId: string; connId: string }> },
) {
  const session = await getSession();
  if (!session?.characterId) return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  const { mapId: rawMapId, connId: rawConnId } = await params;
  const guard = await guardMap(rawMapId);
  if (!guard) return Response.json({ ok: false, error: 'Map not found.' }, { status: 404 });

  const connectionId = parseBigInt(rawConnId);
  if (!connectionId) return Response.json({ ok: false, error: 'Invalid connection id.' }, { status: 400 });

  const result = await deleteConnection({
    mapId: guard.mapId,
    connectionId,
    characterId: BigInt(session.characterId),
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
