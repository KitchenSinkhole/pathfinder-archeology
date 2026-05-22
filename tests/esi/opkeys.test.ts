import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OP_KEYS } from '@/lib/esi/opkeys';

/**
 * The opKey→operationId pairings are inferred from legacy call sites (the vendor
 * package that dispatched them is not in this tree). This test makes the swagger
 * authoritative: every operationId we name must exist in docs/ESI/swagger.json,
 * so a typo or ESI schema drift fails loudly here rather than at runtime.
 */
const swaggerPath = resolve(process.cwd(), 'docs/ESI/swagger.json');
const swagger = readFileSync(swaggerPath, 'utf8');

const operationIds = new Set(
  Array.from(swagger.matchAll(/"operationId":"([a-z_]+)"/g), (m) => m[1]),
);

describe('ESI opKey map', () => {
  it('swagger exposes operationIds', () => {
    expect(operationIds.size).toBeGreaterThan(100);
  });

  it.each(Object.entries(OP_KEYS))('%s → operationId exists in swagger', (_opKey, def) => {
    expect(operationIds.has(def.operationId)).toBe(true);
  });
});
