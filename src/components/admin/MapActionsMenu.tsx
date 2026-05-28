'use client';

import { useState, useTransition } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminPurgeMap,
  adminRestoreMap,
  adminSoftDeleteMap,
} from '@/app/(admin)/actions/maps';
import type { AdminMapListItem } from '@/types';

export function MapActionsMenu({
  map,
  canPurge,
}: {
  map: AdminMapListItem;
  canPurge: boolean;
}) {
  const softDeleted = map.deletedAt !== null;

  return (
    <div className="flex items-center justify-end gap-1">
      {softDeleted ? (
        <>
          <RestoreButton map={map} />
          {canPurge && <PurgeButton map={map} />}
        </>
      ) : (
        <SoftDeleteButton map={map} />
      )}
    </div>
  );
}

function SoftDeleteButton({ map }: { map: AdminMapListItem }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await adminSoftDeleteMap(map.id);
      if (result.ok) {
        toast.success(`Map "${map.name}" soft-deleted.`);
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
            aria-label={`Soft-delete ${map.name}`}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Soft-delete map?</DialogTitle>
          <DialogDescription>
            “{map.name}” will be removed from the active list. It enters a 30-day grace
            period before the <code>map-purge</code> cron permanently deletes it. Admins
            can restore or purge it before then.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? 'Soft-deleting…' : 'Soft-delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreButton({ map }: { map: AdminMapListItem }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await adminRestoreMap(map.id);
      if (result.ok) toast.success(`Map "${map.name}" restored.`);
      else toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Restore ${map.name}`}
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
    >
      <RotateCcw />
    </Button>
  );
}

function PurgeButton({ map }: { map: AdminMapListItem }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [pending, startTransition] = useTransition();
  const enabled = confirmName === map.name && !pending;

  function onConfirm() {
    if (!enabled) return;
    startTransition(async () => {
      const result = await adminPurgeMap(map.id);
      if (result.ok) {
        toast.success(`Map "${map.name}" purged.`);
        setOpen(false);
        setConfirmName('');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmName('');
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Purge ${map.name} now`}
            className="text-destructive hover:bg-destructive/10"
          />
        }
      >
        <Trash2 />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Purge map now?</DialogTitle>
          <DialogDescription>
            This permanently deletes “{map.name}” and every system, connection, signature,
            webhook, and event-history row attached to it. The 30-day grace is skipped.
            This cannot be undone. Type the map name to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={map.name}
          aria-label="Type the map name to confirm purge"
        />
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="ghost" disabled={pending} />}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!enabled}
          >
            {pending ? 'Purging…' : 'Purge permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
