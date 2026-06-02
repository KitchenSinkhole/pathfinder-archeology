'use client';

import { ExternalLink } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChangelogRelease } from '@/lib/integrations/github';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Element-by-element styling for release-note markdown. The project has no
// Tailwind typography plugin, so each tag is mapped to classes consistent with
// the dialog (small, muted body; foreground headings; accent links).
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mt-1 font-heading text-sm font-medium text-foreground">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-1 font-heading text-sm font-medium text-foreground">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-1 font-heading text-xs font-medium text-foreground">{children}</h5>
  ),
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="ml-4 flex list-disc flex-col gap-1">{children}</ul>,
  ol: ({ children }) => <ol className="ml-4 flex list-decimal flex-col gap-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-[0.7rem] leading-relaxed">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-border" />,
  table: ({ children }) => (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

/**
 * Changelog dialog (Stage 17 "What's new"). Renders the GitHub releases
 * timeline. Releases are fetched server-side (cached) in `AppHeader` and passed
 * in as a prop — no client call, so a busy instance never fans out to GitHub's
 * unauthenticated quota. Controlled open-state; mounted from `VersionChip`.
 */
export function ChangelogDialog({
  open,
  onOpenChange,
  releases,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releases: ChangelogRelease[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>Recent Aperture releases.</DialogDescription>
        </DialogHeader>

        {releases.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No release notes are available right now.
          </p>
        ) : (
          <ol className="flex max-h-[70vh] flex-col gap-5 overflow-auto pr-1">
            {releases.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 border-l border-border pl-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">{r.tagName}</span>
                  {r.prerelease && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                      Prerelease
                    </span>
                  )}
                  {r.publishedAt && (
                    <span className="text-xs text-muted-foreground">
                      {dateFormat.format(new Date(r.publishedAt))}
                    </span>
                  )}
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    GitHub <ExternalLink className="size-3" />
                  </a>
                </div>
                {r.name && r.name !== r.tagName && (
                  <h3 className="font-heading text-sm font-medium text-foreground">{r.name}</h3>
                )}
                {r.body && (
                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {r.body}
                    </ReactMarkdown>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
