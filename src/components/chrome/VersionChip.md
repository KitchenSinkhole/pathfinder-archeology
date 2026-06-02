## VersionChip

**Purpose:** Header chip showing the running app version that opens the changelog, with an unseen-release dot.
**File:** `src/components/chrome/VersionChip.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| version | string | yes | App version (from `package.json`), rendered as `v<version>` |
| releases | `ChangelogRelease[]` | yes | Releases fetched server-side in `AppHeader`; passed to the dialog and used to compute the unseen dot |

### Renders
A small, low-padding ghost `Button` with the monospaced version label (`v<version>`), sized to sit inline beside the "Aperture" brand link in `AppHeader`; an accent dot in the top-right corner when there is an unseen latest release. Opening the chip mounts the `ChangelogDialog`.

### Behaviour & Interactions
- The latest release tag (`releases[0].tagName`) is compared against the tag stored under `localStorage["aperture:changelog-seen"]`. A mismatch shows the dot.
- The seen tag is read through `useSyncExternalStore` (localStorage is the external store); a server-snapshot sentinel keeps the dot hidden during SSR/hydration, so there is no hydration mismatch or flash-of-dot.
- Opening the dialog writes the latest tag to `localStorage` and notifies subscribers, clearing the dot in the current tab (the `storage` event only reaches other tabs).
- Seen-tracking is per-device by design (SPEC §17 decision) — no account-side persistence.

### Depends On
- `ChangelogDialog` — controlled-open changelog timeline
- `Button` — `@/components/ui/button`
- `ChangelogRelease` — `@/lib/integrations/github`

### Local State
- `open: boolean` — changelog dialog open flag
