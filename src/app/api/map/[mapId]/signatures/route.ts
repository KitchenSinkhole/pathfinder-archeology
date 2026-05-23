import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { createSignature } from '@/lib/map/mutations/signatures';
import { guardMap, parseBigInt } from '../../utils';

/**
 * POST /api/map/[mapId]/signatures
 * Create a scan signature in a map system.
 * Returns { ok, data, eventId }.
 *
 * INTERIM ACCESS: any logged-in character may call this. Stage 15 adds per-map rights.
 */

const createSignatureBodySchema = z.object({
  mapSystemId: z.string().regex(/^\d+$/),
  mapConnectionId: z.string().regex(/^\d+$/).nullable().optional(),
  sigId: z.string().min(1).max(7),
  groupId: z.number().int().positive().nullable().optional(),
  typeId: z.number().int().positive().nullable().optional(),
  name: z.string().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  expiresAt: z.string().datetime(),
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

  const parsed = createSignatureBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const mapSystemId = parseBigInt(parsed.data.mapSystemId);
  if (!mapSystemId) return Response.json({ ok: false, error: 'Invalid system id.' }, { status: 400 });

  const mapConnectionId = parsed.data.mapConnectionId
    ? parseBigInt(parsed.data.mapConnectionId)
    : null;
  if (parsed.data.mapConnectionId && !mapConnectionId) {
    return Response.json({ ok: false, error: 'Invalid connection id.' }, { status: 400 });
  }

  const result = await createSignature({
    mapId: guard.mapId,
    mapSystemId,
    mapConnectionId,
    characterId: BigInt(session.characterId),
    sigId: parsed.data.sigId,
    groupId: parsed.data.groupId,
    typeId: parsed.data.typeId,
    name: parsed.data.name,
    description: parsed.data.description,
    expiresAt: new Date(parsed.data.expiresAt),
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
