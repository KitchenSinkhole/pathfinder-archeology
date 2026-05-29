import Link from 'next/link';
import { CharacterSwitcher, type SwitcherCharacter } from './CharacterSwitcher';
import { ReferenceMenu } from './ReferenceMenu';

export function AppHeader({
  active,
  characters,
}: {
  active: { id: string; name: string };
  characters: SwitcherCharacter[];
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/maps" className="font-heading text-lg font-semibold tracking-tight">
          Aperture
        </Link>
        <div className="flex items-center gap-1">
          <ReferenceMenu />
          <CharacterSwitcher active={active} characters={characters} />
        </div>
      </div>
    </header>
  );
}
