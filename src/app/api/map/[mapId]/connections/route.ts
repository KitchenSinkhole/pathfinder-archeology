import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { createConnection } from '@/lib/map/mutations/connections';
import { connectionScope, whJumpMass, whMass } from '@/db/schema/ap/enums';
import { parseBigInt, requireMapMutate } from '../../utils';

/**
 * POST /api/map/[mapId]/connections
 * Create a connection between two map systems.
 * Returns { ok, data, eventId }.
 *
 * Access: `map_update` right on the target map.
 */

const createConnectionBodySchema = z.object({
  sourceMapSystemId: z.string().regex(/^\d+$/),
  targetMapSystemId: z.string().regex(/^\d+$/),
  scope: z.enum(connectionScope.enumValues),
  massStatus: z.enum(whMass.enumValues).optional(),
  jumpMassClass: z.enum(whJumpMass.enumValues).nullable().optional(),
  isEol: z.boolean().optional(),
  preserveMass: z.boolean().optional(),
  isRolling: z.boolean().optional(),
});

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId } = await params;
  const guard = await requireMapMutate(rawMapId, session, 'map_update');
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = createConnectionBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const sourceId = parseBigInt(parsed.data.sourceMapSystemId);
  const targetId = parseBigInt(parsed.data.targetMapSystemId);
  if (!sourceId || !targetId) {
    return Response.json({ ok: false, error: 'Invalid system id.' }, { status: 400 });
  }

  const result = await createConnection({
    mapId: guard.mapId,
    characterId: guard.characterId,
    sourceMapSystemId: sourceId,
    targetMapSystemId: targetId,
    scope: parsed.data.scope,
    massStatus: parsed.data.massStatus,
    jumpMassClass: parsed.data.jumpMassClass,
    isEol: parsed.data.isEol,
    preserveMass: parsed.data.preserveMass,
    isRolling: parsed.data.isRolling,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
