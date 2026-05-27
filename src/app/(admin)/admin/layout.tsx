import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { isManagerOrAdmin } from '@/lib/auth/rights';
import { getAccountCharacters, getActiveCharacter, requireSession } from '@/lib/session';
import { CharacterSwitcher } from '@/components/chrome/CharacterSwitcher';
import { AppFooter } from '@/components/chrome/AppFooter';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  if (!(await isManagerOrAdmin(session))) redirect('/maps');
  const active = await getActiveCharacter();
  if (!active) redirect('/');
  const characters = await getAccountCharacters(session.userId);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="font-heading text-lg font-semibold tracking-tight"
            >
              Aperture — Admin
            </Link>
            <Link
              href="/maps"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Leave admin
            </Link>
          </div>
          <CharacterSwitcher
            active={{ id: active.id.toString(), name: active.name }}
            characters={characters.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
          />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6">
        <AdminNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <AppFooter />
      <Toaster />
    </div>
  );
}
