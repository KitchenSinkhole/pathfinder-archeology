## client.ts

**Purpose:** The Stage 4 ESI client substrate — one generic entrypoint (`esiCall`) that dispatches an opKey, attaches a character token when required, gates on a per-endpoint circuit breaker, times out, honours ESI error-limit headers, tolerates the CCP downtime window, and Zod-decodes the response. No business logic.
**File:** `src/lib/esi/client.ts`

---

### esiCall<T>(opKey: OpKey, opts: EsiCallOptions<T>): Promise<T>
Resolves `OP_KEYS[opKey]` → swagger route (`resolveRoute`). Gates on `canRequest`; for `auth: 'character'` ops resolves a bearer token via `resolveCharacterToken`. Builds the URL (path-param substitution + `datasource` + query), `fetch`es with a `ESI_REQUEST_TIMEOUT_MS` timeout, then:
- network/timeout error → `EsiDowntimeError` in window (no breaker hit) else `recordFailure` + `EsiHttpError`.
- non-2xx → checks error budget (`EsiRateLimitError`), then downtime/`EsiHttpError` as above.
- 2xx → `recordSuccess`, parse body through `opts.schema` (`EsiDecodeError` on failure).

**EsiCallOptions<T>:** `{ schema, pathParams?, query?, body?, characterId? }`. `characterId` required for character-auth opKeys.

### Error classes
- `EsiBreakerOpenError(operationId)` — breaker open; request not sent.
- `EsiDowntimeError(operationId)` — failure inside CCP downtime window (expected; breaker untouched).
- `EsiRateLimitError(operationId, resetSeconds)` — `x-esi-error-limit-remain` ≤ 0.
- `EsiHttpError(operationId, status, body)` — non-2xx / network / timeout; counted by the breaker.
- `EsiDecodeError(operationId, cause)` — 2xx body failed Zod validation (schema drift).

### Depends On
- `routes.resolveRoute`, `breaker.{canRequest,recordSuccess,recordFailure}`, `downtime.inDowntimeWindow`.
- `@/lib/auth/eve-provider.refreshAccessToken` + `@/lib/crypto.decryptToken` for token resolution.
- `env.ESI_BASE_URL` / `env.EVE_USER_AGENT`; `apertureConfig.ESI_DATASOURCE` / `ESI_REQUEST_TIMEOUT_MS` / `SSO_TOKEN_REFRESH_BUFFER_S`.
