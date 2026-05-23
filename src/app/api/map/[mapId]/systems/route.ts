import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { addSystem } from '@/lib/map/mutations/systems';
import { guardMap } from '../../utils';

/**
 * POST /api/map/[mapId]/systems
 * Add a solar system to a map. Body: { systemId, positionX?, positionY? }.
 * Returns { ok, data, eventId }.
 *
 * INTERIM ACCESS: any logged-in character may call this. Stage 15 adds per-map rights.
 */

const addSystemBodySchema = z.object({
  systemId: z.number().int().positive(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
) {
  const session = await getSession();
  if (!session?.characterId) return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  const { mapId: rawMapId } = await params;
  const guard = await guardMap(rawMapId);
  if (!guard) return Response.json({ ok: false, error: 'Map not found.' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = addSystemBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const result = await addSystem({
    mapId: guard.mapId,
    characterId: BigInt(session.characterId),
    systemId: parsed.data.systemId,
    positionX: parsed.data.positionX,
    positionY: parsed.data.positionY,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
