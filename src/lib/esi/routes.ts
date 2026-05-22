import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Swagger-backed route resolver for the ESI client.
 *
 * `opkeys.ts` maps an opKey to a swagger `operationId`; this module resolves
 * that `operationId` to the concrete HTTP method, version-prefixed path
 * template (e.g. `/v1/characters/{character_id}/location/`), and the names of
 * its path/query parameters. `docs/ESI/swagger.json` is the single source of
 * truth — the client parses it at runtime rather than duplicating method/path
 * data, so ESI route drift surfaces here rather than as a hand-maintained typo.
 *
 * Server-only: reads the swagger file from disk and is never bundled to the
 * browser (ESI calls run in jobs / server actions / route handlers).
 */

export interface ResolvedRoute {
  method: 'get' | 'post';
  /** Version-prefixed path template with `{param}` placeholders. */
  path: string;
  /** Names of `{…}` path parameters, in template order. */
  pathParams: string[];
  /** Names of query-string parameters the operation accepts. */
  queryParams: string[];
}

interface SwaggerParameter {
  name?: string;
  in?: 'path' | 'query' | 'body' | 'header';
}

interface SwaggerOperation {
  operationId?: string;
  parameters?: SwaggerParameter[];
}

type SwaggerPaths = Record<string, Record<string, SwaggerOperation>>;

let index: Map<string, ResolvedRoute> | null = null;

function buildIndex(): Map<string, ResolvedRoute> {
  const swaggerPath = resolve(process.cwd(), 'docs/ESI/swagger.json');
  const swagger = JSON.parse(readFileSync(swaggerPath, 'utf8')) as { paths: SwaggerPaths };

  const built = new Map<string, ResolvedRoute>();
  for (const [path, methods] of Object.entries(swagger.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op.operationId || (method !== 'get' && method !== 'post')) continue;
      const params = op.parameters ?? [];
      built.set(op.operationId, {
        method,
        path,
        pathParams: params.filter((p) => p.in === 'path' && p.name).map((p) => p.name!),
        queryParams: params.filter((p) => p.in === 'query' && p.name).map((p) => p.name!),
      });
    }
  }
  return built;
}

/**
 * Resolve a swagger `operationId` to its HTTP method, path template, and param
 * names. The swagger file is parsed once and memoized for the process lifetime.
 *
 * Throws if the `operationId` is absent from the checked-in swagger — a loud
 * failure that the opKey inventory test (`tests/esi/opkeys.test.ts`) guards
 * against for the known opKeys.
 */
export function resolveRoute(operationId: string): ResolvedRoute {
  if (!index) index = buildIndex();
  const route = index.get(operationId);
  if (!route) {
    throw new Error(`No swagger operation found for operationId "${operationId}"`);
  }
  return route;
}

/** Test-only: drop the memoized index so a fresh parse can be observed. */
export function __resetRouteIndexForTest(): void {
  index = null;
}
