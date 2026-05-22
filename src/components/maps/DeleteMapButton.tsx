'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deleteMapAction } from '@/app/(app)/actions/map';

export function DeleteMapButton({ mapId, mapName }: { mapId: string; mapName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteMapAction(mapId);
      if (result.ok) {
        toast.success(`Map "${mapName}" deleted.`);
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${mapName}`}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete map?</DialogTitle>
          <DialogDescription>
            “{mapName}” will be removed from the list. It enters a 30-day grace period before it is
            permanently purged.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
