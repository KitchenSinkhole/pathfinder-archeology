## opkeys.test.ts

**Purpose:** Make `docs/ESI/swagger.json` authoritative for the ESI opKey map — asserts every `operationId` in `OP_KEYS` exists in the swagger.
**File:** `tests/esi/opkeys.test.ts`

Parses all `"operationId":"…"` values out of the checked-in swagger and checks each `src/lib/esi/opkeys.ts` entry resolves to one. Catches typos and ESI schema drift at test time instead of runtime — the concrete "diff against swagger" for SPEC §11 Q6. Runs in the default offline `pnpm test` lane (reads a file; no DB/network).
