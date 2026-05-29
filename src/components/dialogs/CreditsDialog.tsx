'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Static credits / about dialog (Stage 17.3). Self-contained: renders its own
 * footer-styled trigger plus the dialog, so the server `AppFooter` can drop it in
 * without becoming a client component. No server call.
 */
export function CreditsDialog({ version }: { version: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
          />
        }
      >
        Credits
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aperture</DialogTitle>
          <DialogDescription>Collaborative wormhole mapping for EVE Online.</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono">{version}</dd>
          <dt className="text-muted-foreground">Lineage</dt>
          <dd>A rebuild of Pathfinder on Next.js + Postgres.</dd>
          <dt className="text-muted-foreground">Static data</dt>
          <dd>EVE Online SDE, courtesy of CCP hf.</dd>
        </dl>

        <p className="text-xs text-muted-foreground">
          EVE Online and all related trademarks are property of CCP hf. Aperture is a
          third-party tool and is not affiliated with or endorsed by CCP.
        </p>
      </DialogContent>
    </Dialog>
  );
}
