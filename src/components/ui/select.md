## Select

**Purpose:** Single-select dropdown primitive (shadcn-style composition on `@base-ui/react/select`).
**File:** `src/components/ui/select.tsx`

### Exports
`Select` (Root), `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectItem`.

### Usage
```tsx
<Select value={scope} onValueChange={setScope} items={SCOPE_LABELS}>
  <SelectTrigger><SelectValue placeholder="Select scope" /></SelectTrigger>
  <SelectContent>
    {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
  </SelectContent>
</Select>
```

### Behaviour & Interactions
- `Select` is generic over the option value type; controlled via `value` / `onValueChange` (base-ui) or uncontrolled via `defaultValue`.
- Pass `items` (a `Record<value, ReactNode>` or array) on `Select` so `SelectValue` can render the chosen option's label.
- `SelectTrigger` shows a chevron; `SelectItem` shows a check `ItemIndicator` when selected. Popup is portalled and anchor-positioned (width matches the trigger via `--anchor-width`).
