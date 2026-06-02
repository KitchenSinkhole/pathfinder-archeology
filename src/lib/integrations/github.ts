import { z } from 'zod';
import { apertureConfig } from '../../../aperture.config';

const GITHUB_BASE = 'https://api.github.com';

export const githubReleaseSchema = z.object({
  id: z.number().int(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  html_url: z.string().url(),
  published_at: z.string().nullable(),
  prerelease: z.boolean(),
  draft: z.boolean(),
});

export const githubReleasesSchema = z.array(githubReleaseSchema);

export type GithubRelease = z.infer<typeof githubReleaseSchema>;
export type ChangelogRelease = {
  id: number;
  tagName: string;
  name: string;
  body: string;
  href: string;
  publishedAt: string | null;
  prerelease: boolean;
};

export async function fetchChangelogReleases(limit = 4): Promise<ChangelogRelease[]> {
  const repo = apertureConfig.GITHUB_CHANGELOG_REPO;
  const url = `${GITHUB_BASE}/repos/${repo}/releases?per_page=${limit}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(apertureConfig.INTEGRATION_REQUEST_TIMEOUT_MS),
    next: { revalidate: apertureConfig.GITHUB_CHANGELOG_REVALIDATE_S },
  });
  if (!res.ok) throw new Error(`GitHub releases request failed: ${res.status}`);

  return githubReleasesSchema.parse(await res.json()).map((r) => ({
    id: r.id,
    tagName: r.tag_name,
    name: r.name ?? r.tag_name,
    body: r.body ?? '',
    href: r.html_url,
    publishedAt: r.published_at,
    prerelease: r.prerelease,
  }));
}
