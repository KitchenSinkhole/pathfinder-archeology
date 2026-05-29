import Link from 'next/link';
import { CharacterPanel, type PanelCharacter } from './CharacterPanel';
import { ReferenceMenu } from './ReferenceMenu';

export function AppHeader({
  active,
  characters,
  mainCharacterId,
}: {
  active: { id: string; name: string };
  characters: PanelCharacter[];
  mainCharacterId: string | null;
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/maps" className="font-heading text-lg font-semibold tracking-tight">
          Aperture
        </Link>
        <div className="flex items-center gap-1">
          <ReferenceMenu />
          <CharacterPanel
            active={active}
            characters={characters}
            mainCharacterId={mainCharacterId}
          />
        </div>
      </div>
    </header>
  );
}
