## integrations.test.ts

**Purpose:** Unit coverage for Stage 13 third-party clients, link helpers, and payload decoders.
**File:** `tests/unit/integrations.test.ts`

---

### Stage 13 decoders
Asserts representative ESI sov/FW, zKillboard, EVE-Scout, and GitHub payloads pass their Zod schemas.

---

### Stage 13 link helpers
Asserts DOTLAN, EVEEYE, Anoik, zKillboard, and CCP image helper URLs are stable.

---

### Stage 13 integration clients
Mocks `fetch` to prove zKillboard mapping/rate-limit handling, EVE-Scout mapping/error envelopes, and GitHub changelog release mapping.
