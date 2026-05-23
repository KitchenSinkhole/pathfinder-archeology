## InlineTextEdit

**Purpose:** Double-click-to-edit text input used inline on the system tile for alias and tag.
**File:** `src/components/map/InlineTextEdit.tsx`

### Props
| Prop | Type | Required | Description |
|---|---|---|---|
| value | string \| null | yes | Current value (null shows the placeholder). |
| placeholder | string | no | Shown when value is null. |
| className | string | no | Class on the idle span. |
| inputClassName | string | no | Class on the editor input. |
| ariaLabel | string | no | Accessibility label for both states. |
| maxLength | number | no | Forwarded to the input. |
| onCommit | (next: string \| null) => void | yes | Fires on Enter when the value changed; empty input commits as null. |

### Renders
Either a span with the value, or an autofocused input.

### Behaviour & Interactions
- Double-click on the idle span flips to edit mode.
- Enter commits, Esc / blur cancels.
- Whitespace-only is treated as empty and commits as null.
- The input carries the `nodrag nopan` classes so xyflow does not hijack drag / pan inside the editor.
- Idle span is a plain non-focusable `<span>` (no `role="button"` / `tabIndex`) so a single click bubbles up to xyflow's node wrapper and selects the parent system. Keyboard-driven edits go through `InspectorModule`.
- The caller persists the commit (typically a PATCH); `InlineTextEdit` only emits the new value.

### Depends On
- `cn` from `@/lib/utils`
