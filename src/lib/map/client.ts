import type {
  ActionResult,
  BulkPasteOptions,
  BulkPasteResult,
  ImportResult,
  MapEventPayload,
  MapExportFile,
  ParsedSigRow,
  ResolvedSigRow,
  SignatureGroupKey,
  SystemSearchResult,
  WormholeTypeOption,
} from '@/types';
import type {
  ConnectionScope,
  SystemStatus,
  WhJumpMass,
  WhMass,
} from '@/lib/map/enumLabels';
import { requestJson, type FetchResult } from '@/lib/http/fetchJson';

/** GET responses don't carry an `eventId`; mutation routes do. */
export type { FetchResult };

/**
 * Client-side fetch wrappers for the Stage 9.4 JSON API routes.
 *
 * Each mutation helper returns `ActionResult<MapEventPayload>` — the same body
 * shape the route emits, so callers can feed the success payload straight into
 * `applyEvent`. The wrappers only handle the network layer; optimistic apply /
 * rollback is orchestrated in `MapCanvas` (it owns the view state).
 *
 * On a non-2xx response or thrown network error the helpers fire a `toast.error`
 * before returning the `{ ok: false, error }` result, so callers don't need to
 * duplicate the toast in every catch.
 */

// ---------------------------------------------------------------------------
// Shared input shapes — mirror the Zod route schemas so the wire stays the
// single source of truth. They are intentionally NOT the server-side patch
// types (which use native `Date`); these are what crosses the wire.
// ---------------------------------------------------------------------------

export type UpdateSystemBody = {
  alias?: string | null;
  tag?: string | null;
  status?: SystemStatus;
  intelNotes?: string | null;
  locked?: boolean;
  /** ISO datetime string; null clears the rally point. */
  rallyAt?: string | null;
  positionX?: number;
  positionY?: number;
};

export type CreateConnectionBody = {
  sourceMapSystemId: string;
  targetMapSystemId: string;
  scope: ConnectionScope;
  massStatus?: WhMass;
  jumpMassClass?: WhJumpMass | null;
  isEol?: boolean;
  preserveMass?: boolean;
  isRolling?: boolean;
};

export type UpdateConnectionBody = {
  scope?: ConnectionScope;
  massStatus?: WhMass;
  jumpMassClass?: WhJumpMass | null;
  isEol?: boolean;
  preserveMass?: boolean;
  isRolling?: boolean;
};

export type CreateSignatureBody = {
  mapSystemId: string;
  mapConnectionId?: string | null;
  sigId: string;
  groupKey?: SignatureGroupKey | null;
  typeId?: number | null;
  name?: string | null;
  description?: string | null;
  /** ISO datetime string. */
  expiresAt: string;
};

export type UpdateSignatureBody = {
  mapConnectionId?: string | null;
  sigId?: string;
  groupKey?: SignatureGroupKey | null;
  typeId?: number | null;
  name?: string | null;
  description?: string | null;
  expiresAt?: string;
};

// ---------------------------------------------------------------------------
// Shared fetch core. Folds all non-2xx + thrown errors into `{ ok: false }` and
// surfaces a toast so callers don't have to.
// ---------------------------------------------------------------------------

function mutationFetch<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<ActionResult<T>> {
  return requestJson<ActionResult<T>>(method, url, body);
}

function readFetch<T>(url: string): Promise<FetchResult<T>> {
  return requestJson<FetchResult<T>>('GET', url);
}

// ---------------------------------------------------------------------------
// System mutations
// ---------------------------------------------------------------------------

export function addSystemOnServer(args: {
  mapId: string;
  systemId: number;
  positionX?: number;
  positionY?: number;
}): Promise<ActionResult<MapEventPayload>> {
  const { mapId, ...body } = args;
  return mutationFetch<MapEventPayload>('POST', `/api/map/${mapId}/systems`, body);
}

/**
 * Solar-system name search for the "add system manually" dialog. Read-only
 * (view rights), so it returns a plain `FetchResult` with no `eventId`. The
 * caller debounces; a query under 2 chars returns `[]` from the server.
 */
export function searchSystemsOnServer(args: {
  mapId: string;
  query: string;
}): Promise<FetchResult<SystemSearchResult[]>> {
  return readFetch<SystemSearchResult[]>(
    `/api/map/${args.mapId}/system-search?q=${encodeURIComponent(args.query)}`,
  );
}

export function updateSystemOnServer(args: {
  mapId: string;
  mapSystemId: string;
  patch: UpdateSystemBody;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>(
    'PATCH',
    `/api/map/${args.mapId}/systems/${args.mapSystemId}`,
    args.patch,
  );
}

export function removeSystemOnServer(args: {
  mapId: string;
  mapSystemId: string;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>(
    'DELETE',
    `/api/map/${args.mapId}/systems/${args.mapSystemId}`,
  );
}

// ---------------------------------------------------------------------------
// Connection mutations
// ---------------------------------------------------------------------------

export function createConnectionOnServer(args: {
  mapId: string;
  body: CreateConnectionBody;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>('POST', `/api/map/${args.mapId}/connections`, args.body);
}

export function updateConnectionOnServer(args: {
  mapId: string;
  connectionId: string;
  patch: UpdateConnectionBody;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>(
    'PATCH',
    `/api/map/${args.mapId}/connections/${args.connectionId}`,
    args.patch,
  );
}

export function deleteConnectionOnServer(args: {
  mapId: string;
  connectionId: string;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>(
    'DELETE',
    `/api/map/${args.mapId}/connections/${args.connectionId}`,
  );
}

// ---------------------------------------------------------------------------
// Signature mutations
// ---------------------------------------------------------------------------

export function createSignatureOnServer(args: {
  mapId: string;
  body: CreateSignatureBody;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>('POST', `/api/map/${args.mapId}/signatures`, args.body);
}

export function updateSignatureOnServer(args: {
  mapId: string;
  signatureId: string;
  patch: UpdateSignatureBody;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>(
    'PATCH',
    `/api/map/${args.mapId}/signatures/${args.signatureId}`,
    args.patch,
  );
}

export function deleteSignatureOnServer(args: {
  mapId: string;
  signatureId: string;
}): Promise<ActionResult<MapEventPayload>> {
  return mutationFetch<MapEventPayload>(
    'DELETE',
    `/api/map/${args.mapId}/signatures/${args.signatureId}`,
  );
}

// ---------------------------------------------------------------------------
// Signature paste — bulk diff + resolver preview (Stage 10.2)
// ---------------------------------------------------------------------------

export type PasteSignaturesBody = {
  mapSystemId: string;
  rows: ParsedSigRow[];
  options: BulkPasteOptions;
};

/**
 * Bulk paste: server diffs `rows` against existing sigs and commits add /
 * update / remove (+ optional connection tear-down) atomically. Returns the
 * full committed event payloads so the caller can register each `eventId`
 * in its dedupe set and apply each payload locally — the bulk endpoint is
 * N-events, so the wrapper-level `eventId` is always `0` here.
 */
export function pasteSignaturesOnServer(args: {
  mapId: string;
  body: PasteSignaturesBody;
}): Promise<ActionResult<BulkPasteResult>> {
  return mutationFetch<BulkPasteResult>(
    'POST',
    `/api/map/${args.mapId}/signatures/bulk`,
    args.body,
  );
}

/**
 * Preview-only resolver. Feeds the paste dialog's preview table so users see
 * which rows will resolve to a known group / type before they submit. The
 * bulk POST always re-resolves authoritatively.
 */
export function resolveSignaturesOnServer(args: {
  mapId: string;
  rows: ParsedSigRow[];
}): Promise<FetchResult<ResolvedSigRow[]>> {
  return mutationFetch<ResolvedSigRow[]>(
    'POST',
    `/api/map/${args.mapId}/signatures/resolve`,
    { rows: args.rows },
  ).then((result) =>
    result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error },
  );
}

// ---------------------------------------------------------------------------
// Map import / export (Stage 17.6)
// ---------------------------------------------------------------------------

/**
 * Download the map's current state as a `MapExportFile` (read; `map_export`
 * right). Returns a plain `FetchResult` — no `eventId`. The caller serialises
 * the result and triggers the browser download (so it can name the file).
 */
export function exportMapOnServer(args: { mapId: string }): Promise<FetchResult<MapExportFile>> {
  return readFetch<MapExportFile>(`/api/map/${args.mapId}/export`);
}

/**
 * Merge a `MapExportFile` into the open map (`map_import` right). Returns the N
 * committed event payloads (like the bulk-paste path) so the caller folds each
 * locally and registers its `eventId` for echo dedupe; the wrapper-level
 * `eventId` is always `0`.
 */
export function importMapOnServer(args: {
  mapId: string;
  data: unknown;
}): Promise<ActionResult<ImportResult>> {
  return mutationFetch<ImportResult>('POST', `/api/map/${args.mapId}/import`, args.data);
}

// ---------------------------------------------------------------------------
// Wormhole-type catalog lookup
// ---------------------------------------------------------------------------

/**
 * Tiny per-session cache keyed by `${mapId}:${universeSystemId}`. WH catalog
 * filtering is deterministic and immutable for a given system class, so a hit
 * lets the inspector swap between systems without re-fetching.
 */
const wormholeTypeCache = new Map<string, WormholeTypeOption[]>();

export async function fetchWormholeTypes(args: {
  mapId: string;
  /** EVE solar-system id, not `ap_map_system.id`. */
  universeSystemId: number;
}): Promise<FetchResult<WormholeTypeOption[]>> {
  const cacheKey = `${args.mapId}:${args.universeSystemId}`;
  const cached = wormholeTypeCache.get(cacheKey);
  if (cached) return { ok: true, data: cached };

  const result = await readFetch<WormholeTypeOption[]>(
    `/api/map/${args.mapId}/wormhole-types?systemId=${args.universeSystemId}`,
  );
  if (result.ok) wormholeTypeCache.set(cacheKey, result.data);
  return result;
}
