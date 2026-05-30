## chart.tsx

**Purpose:** Trimmed shadcn-style Recharts wrapper (Stage 17.8) — a themed responsive container plus a compact tooltip, for the system-graph small-multiples module.
**File:** `src/components/ui/chart.tsx`

### ChartContainer
`ChartContainer({ className, children, ...divProps }): JSX` — wraps a single Recharts chart element in a `ResponsiveContainer` (fills the parent div, so give the div a height via `className`). Applies muted-foreground tick text and faint grid lines via Tailwind arbitrary selectors. `children` must be a single chart element (`<AreaChart>` etc.).

### ChartTooltipContent
`ChartTooltipContent({ active?, payload?, label?, valueFormatter? }): JSX | null` — pass as `content={<ChartTooltipContent valueFormatter={fmt} />}` to a Recharts `<Tooltip>`; Recharts injects `active`/`payload`/`label`. Renders a small popover-styled list of series swatches + values. `valueFormatter` formats numeric values (e.g. compact counts).

### ChartTooltip
Re-export of Recharts' `Tooltip`.

### Depends On
- `recharts` (`ResponsiveContainer`, `Tooltip`)
- `@/lib/utils` (`cn`)
