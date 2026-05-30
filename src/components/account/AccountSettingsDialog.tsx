'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  setConnectionTravelAnimationAction,
  setMainCharacterAction,
} from '@/app/(app)/actions/account';
import { DeleteAccountDialog } from './DeleteAccountDialog';

export type AccountCharacter = {
  id: string;
  name: string;
  status: 'active' | 'kicked' | 'banned';
  authzLevel: 'member' | 'manager' | 'admin';
};

function portraitUrl(characterId: string, size = 64): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

const ROLE_LABEL: Record<AccountCharacter['authzLevel'], string> = {
  member: 'Member',
  manager: 'Manager',
  admin: 'Admin',
};

export function AccountSettingsDialog({
  open,
  onOpenChange,
  characters,
  mainCharacterId,
  activeCharacter,
  travelAnimation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: AccountCharacter[];
  mainCharacterId: string | null;
  activeCharacter: { id: string; name: string };
  travelAnimation: boolean;
}) {
  // Optimistic local copy so the "Main" marker moves immediately on success.
  const [mainId, setMainId] = useState(mainCharacterId);
  const [travelOn, setTravelOn] = useState(travelAnimation);
  const [pending, startTransition] = useTransition();

  function onSetMain(id: string) {
    if (id === mainId) return;
    startTransition(async () => {
      const result = await setMainCharacterAction(id);
      if (result.ok) {
        setMainId(id);
      } else {
        toast.error(result.error);
      }
    });
  }

  function onToggleTravel(next: boolean) {
    setTravelOn(next);
    startTransition(async () => {
      const result = await setConnectionTravelAnimationAction(next);
      if (!result.ok) {
        setTravelOn(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>
            Your main is the identity the map landing, statistics, and activity log attribute to —
            whichever character you sign in with, you act as your main.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          {characters.map((c) => {
            const isMain = c.id === mainId;
            const selectable = c.status === 'active' && !isMain && !pending;
            return (
              <div
                key={c.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                  isMain && 'bg-muted',
                )}
              >
                <Avatar size="sm">
                  <AvatarImage src={portraitUrl(c.id, 32)} alt={c.name} />
                  <AvatarFallback>{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[c.authzLevel]}</span>
                {c.status !== 'active' ? (
                  <span className="text-xs text-muted-foreground capitalize">{c.status}</span>
                ) : isMain ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <Star className="size-3.5 fill-current" />
                    Main
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!selectable}
                    onClick={() => onSetMain(c.id)}
                  >
                    Set as main
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <label className="mt-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="font-medium text-foreground">Show connection travel animation</span>
            <span className="text-xs text-muted-foreground">
              Subtle directional pulse when a tracked pilot jumps between connected systems.
            </span>
          </div>
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={travelOn}
            disabled={pending}
            onChange={(e) => onToggleTravel(e.target.checked)}
            aria-label="Show connection travel animation"
          />
        </label>

        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-destructive/40 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Delete account</span>
            <span className="text-xs text-muted-foreground">
              Permanently removes your account and every character on it. This cannot be undone.
            </span>
          </div>
          <DeleteAccountDialog confirmName={activeCharacter.name} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
