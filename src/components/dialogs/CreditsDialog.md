## CreditsDialog

**Purpose:** Static credits / about dialog (version + EVE/CCP attribution).
**File:** `src/components/dialogs/CreditsDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| version | string | yes | App version string (passed in by the server footer from `package.json`) |

### Renders
A footer-styled "Credits" trigger button plus a dialog with the app name, version, lineage, static-data credit, and the CCP trademark notice.

### Behaviour & Interactions
- Self-contained: owns its own `DialogTrigger`, so a server component (`AppFooter`) can render it without becoming a client component. No server call, no controlled-open prop.
- Copy is intentionally minimal and meant to be edited as the project gains a public repo / donation links.

### Depends On
- `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` — `@/components/ui/dialog`
