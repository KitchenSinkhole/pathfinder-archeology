## tabs.tsx

**Purpose:** Thin styled wrapper over `@base-ui/react/tabs` providing the project's tab strip primitive.
**File:** `src/components/ui/tabs.tsx`

---

### Tabs(props: TabsPrimitive.Root.Props)
Root container. Controlled via `value` / `onValueChange`, or uncontrolled via `defaultValue` (defaults to `0`). Lays children out in a vertical flex column.

### TabsList(props: TabsPrimitive.List.Props)
The horizontal tab-button strip with a bottom border the selected tab's indicator sits on.

### TabsTab(props: TabsPrimitive.Tab.Props)
An individual tab button. Requires a `value` matching its panel. Muted when inactive; gains a primary bottom-border + foreground text when `data-selected`.

### TabsPanel(props: TabsPrimitive.Panel.Props)
Content panel shown when the `Tab` with the matching `value` is active. Hidden (unmounted) otherwise unless `keepMounted` is set.

---

Used by `MapInfoDialog` (Summary / Systems / Connections / Users). Intended for reuse by later Stage 17 dialogs (account settings, statistics).
