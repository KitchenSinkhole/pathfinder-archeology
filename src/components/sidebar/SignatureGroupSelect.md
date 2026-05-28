## SignatureGroupSelect

**Purpose:** Fixed dropdown of the seven scanner-level signature groups (Combat / Relic / Data / Gas / Wormhole / Ore / Ghost) plus an "unknown" sentinel mapped to `null`. Used in `SignatureModule` for both the per-row Group cell and the draft-input row.
**File:** `src/components/sidebar/SignatureGroupSelect.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| value | SignatureGroupKey \| null | yes | The currently selected group key, or `null` for "unknown". |
| onValueChange | (next: SignatureGroupKey \| null) => void | yes | Fires when the user picks a different option. |
| disabled | boolean | no | Disables the trigger. |

### Renders
A shadcn `Select` with eight options: an "unknown" sentinel (maps to `null`) followed by the seven entries of `SIGNATURE_GROUP_CATALOG`.

### Behaviour & Interactions
- Treats the internal sentinel string `__none__` as `null` in both directions.
- Pure-client — the catalog is a static import, no fetch.

### Depends On
- `Select*` from `@/components/ui/select`
- `SIGNATURE_GROUP_CATALOG` from `@/lib/map/signatureGroups`
- `SignatureGroupKey` from `@/types`
