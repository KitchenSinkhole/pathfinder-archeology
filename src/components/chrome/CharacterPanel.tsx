'use client';

import { useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { LogOut, Plus, Settings } from 'lucide-react';
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
  setCharacterTrackingAction,
  signOutAction,
} from '@/app/(app)/actions/character';
import { AccountSettingsDialog } from '@/components/account/AccountSettingsDialog';

export type PanelCharacter = {
  id: string;
  name: string;
  status: 'active' | 'kicked' | 'banned';
  authzLevel: 'member' | 'manager' | 'admin';
  trackingEnabled: boolean;
};

function portraitUrl(characterId: string, size = 64): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

/** The open map's id from the `/map/[[...slug]]` route, or null when not on a map. */
function currentMapIdFromParams(slug: unknown): string | null {
  if (!Array.isArray(slug)) return null;
  const first = slug[0];
  return typeof first === 'string' && /^\d+$/.test(first) ? first : null;
}

export function CharacterPanel({
  active,
  characters,
  mainCharacterId,
}: {
  active: { id: string; name: string };
  characters: PanelCharacter[];
  mainCharacterId: string | null;
}) {
  const params = useParams();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Optimistic per-character tracking state so a toggle flips immediately; the
  // action's `revalidatePath('/', 'layout')` reconciles the server roster.
  const [tracking, setTracking] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(characters.map((c) => [c.id, c.trackingEnabled])),
  );

  function onToggle(id: string, next: boolean) {
    const mapId = currentMapIdFromParams(params?.slug);
    setTracking((t) => ({ ...t, [id]: next }));
    startTransition(async () => {
      const result = await setCharacterTrackingAction(id, next, mapId);
      if (!result.ok) {
        setTracking((t) => ({ ...t, [id]: !next }));
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
          <SheetDescription>Choose which of your characters Aperture tracks on your map.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1 px-4">
          {characters.map((c) => {
            const isMain = c.id === mainCharacterId;
            const inactive = c.status !== 'active';
            const checked = tracking[c.id] ?? c.trackingEnabled;
            return (
              <label
                key={c.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                  inactive ? 'opacity-50' : 'hover:bg-muted',
                )}
              >
                <Avatar size="sm">
                  <AvatarImage src={portraitUrl(c.id, 32)} alt={c.name} />
                  <AvatarFallback>{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">
                  {c.name}
                  {isMain && <span className="ml-1.5 text-xs text-muted-foreground">main</span>}
                </span>
                {inactive ? (
                  <span className="text-xs text-muted-foreground capitalize">{c.status}</span>
                ) : (
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    disabled={pending}
                    onChange={(e) => onToggle(c.id, e.target.checked)}
                    aria-label={`Track ${c.name}`}
                  />
                )}
              </label>
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
