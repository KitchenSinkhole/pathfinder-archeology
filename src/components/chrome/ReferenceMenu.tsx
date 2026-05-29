'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { SystemEffectsDialog } from '@/components/dialogs/SystemEffectsDialog';
import { JumpInfoDialog } from '@/components/dialogs/JumpInfoDialog';

/**
 * Header "Info" menu (Stage 17.3) — the entry point for the static reference
 * dialogs. Owns the open-state for each dialog it can launch.
 */
export function ReferenceMenu() {
  const [systemEffectsOpen, setSystemEffectsOpen] = useState(false);
  const [jumpInfoOpen, setJumpInfoOpen] = useState(false);

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Reference info">
              <Info />
            </Button>
          }
        />
        <MenuContent>
          <MenuItem onClick={() => setSystemEffectsOpen(true)}>System effects</MenuItem>
          <MenuItem onClick={() => setJumpInfoOpen(true)}>Jump info</MenuItem>
        </MenuContent>
      </Menu>

      <SystemEffectsDialog open={systemEffectsOpen} onOpenChange={setSystemEffectsOpen} />
      <JumpInfoDialog open={jumpInfoOpen} onOpenChange={setJumpInfoOpen} />
    </>
  );
}
