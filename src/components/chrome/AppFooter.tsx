import pkg from '../../../package.json';
import { CreditsDialog } from '@/components/dialogs/CreditsDialog';

export function AppFooter() {
  return (
    <footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <span>Aperture — collaborative wormhole mapping for EVE Online</span>
          <CreditsDialog version={pkg.version} />
        </div>
        <span>EVE Online and all related trademarks are property of CCP hf.</span>
      </div>
    </footer>
  );
}
