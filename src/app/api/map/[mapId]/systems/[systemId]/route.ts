import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { removeSystem, updateSystem } from '@/lib/map/mutations/systems';
import { systemStatus } from '@/db/schema/ap/enums';
import { parseBigInt, requireMapMutate } from '../../../utils';

/**
 * PATCH /api/map/[mapId]/systems/[systemId]  — update a placed system's fields.
 * DELETE /api/map/[mapId]/systems/[systemId] — remove a system (visible=false, row persists).
 *
 * [systemId] is `ap_map_system.id` (the xyflow node id), NOT the EVE solar-system id.
 *
 * Access: `map_update` right on the target map.
 */

const updateSystemBodySchema = z.object({
  alias: z.string().max(100).nullable().optional(),
  tag: z.string().max(50).nullable().optional(),
  status: z.enum(systemStatus.enumValues).optional(),
  intelNotes: z.string().nullable().optional(),
  locked: z.boolean().optional(),
  rallyAt: z.string().datetime().nullable().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string; systemId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId, systemId: rawSystemId } = await params;
  const guard = await requireMapMutate(rawMapId, session, 'map_update');
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const mapSystemId = parseBigInt(rawSystemId);
  if (!mapSystemId) return Response.json({ ok: false, error: 'Invalid system id.' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = updateSystemBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const patch = {
    ...parsed.data,
    rallyAt: parsed.data.rallyAt !== undefined
      ? (parsed.data.rallyAt ? new Date(parsed.data.rallyAt) : null)
      : undefined,
  };

  const result = await updateSystem({
    mapId: guard.mapId,
    mapSystemId,
    characterId: guard.characterId,
    patch,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ mapId: string; systemId: string }> },
) {
  const session = await getSession();
  const { mapId: rawMapId, systemId: rawSystemId } = await params;
  const guard = await requireMapMutate(rawMapId, session, 'map_update');
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const mapSystemId = parseBigInt(rawSystemId);
  if (!mapSystemId) return Response.json({ ok: false, error: 'Invalid system id.' }, { status: 400 });

  const result = await removeSystem({
    mapId: guard.mapId,
    mapSystemId,
    characterId: guard.characterId,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
