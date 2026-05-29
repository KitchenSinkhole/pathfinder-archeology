'use client';

import { useState, useTransition } from 'react';
import { Check, LogOut, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  addCharacterAction,
  signOutAction,
  switchCharacterAction,
} from '@/app/(app)/actions/character';
import { AccountSettingsDialog } from '@/components/account/AccountSettingsDialog';

export type SwitcherCharacter = {
  id: string;
  name: string;
  status: 'active' | 'kicked' | 'banned';
  authzLevel: 'member' | 'manager' | 'admin';
};

function portraitUrl(characterId: string, size = 64): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

export function CharacterSwitcher({
  active,
  characters,
  mainCharacterId,
}: {
  active: { id: string; name: string };
  characters: SwitcherCharacter[];
  mainCharacterId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSwitch(id: string) {
    if (id === active.id) return setOpen(false);
    startTransition(async () => {
      const result = await switchCharacterAction(id);
      if (result.ok) {
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="default" className="gap-2">
            <Avatar size="sm">
              <AvatarImage src={portraitUrl(active.id, 32)} alt={active.name} />
              <AvatarFallback>{active.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{active.name}</span>
          </Button>
        }
      />
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Characters</SheetTitle>
          <SheetDescription>Switch the active character or add another to this account.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1 px-4">
          {characters.map((c) => {
            const isActive = c.id === active.id;
            const disabled = c.status !== 'active' || pending;
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => onSwitch(c.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                  isActive ? 'bg-muted' : 'hover:bg-muted',
                  disabled && !isActive && 'opacity-50',
                )}
              >
                <Avatar size="sm">
                  <AvatarImage src={portraitUrl(c.id, 32)} alt={c.name} />
                  <AvatarFallback>{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{c.name}</span>
                {c.status !== 'active' && (
                  <span className="text-xs text-muted-foreground capitalize">{c.status}</span>
                )}
                {isActive && <Check className="text-primary" />}
              </button>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-2 p-4">
          <form action={addCharacterAction}>
            <Button type="submit" variant="outline" className="w-full gap-2" disabled={pending}>
              <Plus />
              Add character
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            className="w-full gap-2"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Settings />
            Account settings
          </Button>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" className="w-full gap-2" disabled={pending}>
              <LogOut />
              Sign out
            </Button>
          </form>
        </div>
      </SheetContent>

      <AccountSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        characters={characters}
        mainCharacterId={mainCharacterId}
        activeCharacter={active}
      />
    </Sheet>
  );
}
