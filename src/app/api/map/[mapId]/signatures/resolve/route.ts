import 'server-only';
import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { resolveSignatureRows } from '@/lib/map/signatureReader';
import type { ParsedSigRow } from '@/lib/map/signatureParser';
import { guardMap } from '../../../utils';

/**
 * POST /api/map/[mapId]/signatures/resolve — best-effort preview resolver for
 * the paste dialog. Feeds the live preview table; the bulk POST always
 * re-resolves authoritatively, so this endpoint can never desync the final
 * commit. POST (not GET) because a 30-sig paste can easily exceed a sensible
 * URL length.
 */

const parsedRowSchema = z.object({
  sigId: z.string().min(1).max(7),
  name: z.string().nullable(),
  groupName: z.string().nullable(),
  signal: z.string().nullable(),
});

const resolveBodySchema = z.object({
  rows: z.array(parsedRowSchema).max(500),
});

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
) {
  const session = await getSession();
  if (!session?.characterId)
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  const { mapId: rawMapId } = await params;
  const guard = await guardMap(rawMapId);
  if (!guard) return Response.json({ ok: false, error: 'Map not found.' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = resolveBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    );
  }

  const resolved = await resolveSignatureRows(parsed.data.rows as ParsedSigRow[]);
  return Response.json({ ok: true, data: resolved });
}
