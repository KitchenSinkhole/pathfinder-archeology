'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatisticsDialog } from '@/components/dialogs/StatisticsDialog';

/**
 * Header entry point for the Stage 17.7 Statistics dialog. Owns the dialog's
 * open-state; sits beside `ReferenceMenu` in `AppHeader`.
 */
export function StatisticsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Statistics"
        onClick={() => setOpen(true)}
      >
        <BarChart3 />
      </Button>
      <StatisticsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
