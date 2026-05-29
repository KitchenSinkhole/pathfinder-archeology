'use client';

import { useState, useTransition } from 'react';
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
import { Input } from '@/components/ui/input';
import { deleteAccountAction } from '@/app/(app)/actions/account';

/**
 * Type-to-confirm account deletion. The user must type their active character's
 * name to enable the destructive button — friction proportional to an
 * irreversible, cascading action.
 */
export function DeleteAccountDialog({ confirmName }: { confirmName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  const confirmed = typed.trim() === confirmName;

  function onConfirm() {
    if (!confirmed) return;
    startTransition(async () => {
      // Success throws a redirect inside signOut and never returns here.
      const result = await deleteAccountAction();
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped('');
      }}
    >
      <DialogTrigger render={<Button type="button" variant="destructive" size="sm" />}>
        Delete account
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription>
            All your characters are removed, maps you own are orphaned, and your map and structure
            history is anonymized. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete-account-confirm" className="text-sm text-muted-foreground">
            Type <span className="font-medium text-foreground">{confirmName}</span> to confirm.
          </label>
          <Input
            id="delete-account-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!confirmed || pending}
          >
            {pending ? 'Deleting…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
