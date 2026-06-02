import Link from 'next/link';
import pkg from '../../../package.json';
import { fetchChangelogReleases, type ChangelogRelease } from '@/lib/integrations/github';
import { CharacterPanel, type PanelCharacter } from './CharacterPanel';
import { ReferenceMenu } from './ReferenceMenu';
import { StatisticsButton } from './StatisticsButton';
import { VersionChip } from './VersionChip';

export async function AppHeader({
  active,
  characters,
  mainCharacterId,
  travelAnimation,
}: {
  active: { id: string; name: string };
  characters: PanelCharacter[];
  mainCharacterId: string | null;
  travelAnimation: boolean;
}) {
  // A changelog fetch failure (GitHub down, rate limit) must never break the
  // header — the chip just renders without release notes.
  let releases: ChangelogRelease[] = [];
  try {
    releases = await fetchChangelogReleases();
  } catch {
    releases = [];
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-1.5">
          <Link href="/maps" className="font-heading text-lg font-semibold tracking-tight">
            Aperture
          </Link>
          <VersionChip version={pkg.version} releases={releases} />
        </div>
        <div className="flex items-center gap-1">
          <StatisticsButton />
          <ReferenceMenu />
          <CharacterPanel
            active={active}
            characters={characters}
            mainCharacterId={mainCharacterId}
            travelAnimation={travelAnimation}
          />
        </div>
      </div>
    </header>
  );
}
