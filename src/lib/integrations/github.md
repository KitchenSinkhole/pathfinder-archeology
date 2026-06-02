## github.ts

**Purpose:** GitHub release/changelog client.
**File:** `src/lib/integrations/github.ts`

---

### fetchChangelogReleases(limit?: number): Promise<ChangelogRelease[]>
Fetches releases from `apertureConfig.GITHUB_CHANGELOG_REPO` using GitHub's REST releases endpoint, decodes the response with Zod, and maps it to sidebar/dialog-ready changelog entries. The fetch is server-cached via `next: { revalidate: apertureConfig.GITHUB_CHANGELOG_REVALIDATE_S }` so the shared unauthenticated GitHub quota is not hit per-client.

**Parameters:**
- `limit` - `per_page` value for the GitHub request.

**Returns:** Release id, tag/name/body, GitHub URL, publication time, and prerelease flag.
