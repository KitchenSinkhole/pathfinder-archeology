## ChangelogDialog

**Purpose:** "What's new" dialog rendering the GitHub releases timeline.
**File:** `src/components/dialogs/ChangelogDialog.tsx`

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| open | boolean | yes | Controlled open state |
| onOpenChange | (open: boolean) => void | yes | Open-state setter |
| releases | `ChangelogRelease[]` | yes | Releases to render; fetched server-side (cached) in `AppHeader` |

### Renders
A `max-w-2xl` dialog titled "What's new" with a scrollable vertical timeline (`<ol>`), newest first. Each entry: version tag (mono), optional "Prerelease" badge, publish date, a "GitHub" link out, the release name (when distinct from the tag), and the release body rendered as GitHub-flavored markdown. Shows an empty-state line when `releases` is empty.

### Behaviour & Interactions
- No client-side fetch — releases are passed in, so a busy instance never fans out to GitHub's unauthenticated quota.
- Release bodies are rendered with `react-markdown` + `remark-gfm`. Raw HTML is not enabled (no `rehype-raw`), so bodies are XSS-safe. A local `markdownComponents` map styles each element with Tailwind classes consistent with the dialog (the project has no typography plugin); markdown links open in a new tab.

### Depends On
- `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription` — `@/components/ui/dialog`
- `react-markdown`, `remark-gfm` — release-note rendering
- `ChangelogRelease` — `@/lib/integrations/github`
