## registry.ts

**Purpose:** The `tag_scheme` → `TagStrategy` lookup; the single extension point for adding a scheme (Stage 17.10).
**File:** `src/lib/tagging/registry.ts`

---

### TAG_STRATEGIES: Record<ActiveScheme, TagStrategy>
Maps `'abc'` → `abcStrategy` and `'0121'` → `scheme0121Strategy`. Adding a third scheme = a new strategy module + its `tag_scheme` enum value + one line here; the existing strategies are untouched.
