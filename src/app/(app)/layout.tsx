import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { getAccountCharacters, getActiveCharacter, requireSession } from '@/lib/session';
import { AppHeader } from '@/components/chrome/AppHeader';
import { AppFooter } from '@/components/chrome/AppFooter';
import { RealtimeProvider } from '@/lib/realtime/useRealtime';
import { RealtimeStatusBanner } from '@/components/RealtimeStatusBanner';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const active = await getActiveCharacter();
  if (!active) redirect('/');
  const characters = await getAccountCharacters(session.userId);

  return (
    <RealtimeProvider>
      <div className="flex min-h-screen flex-col">
        <RealtimeStatusBanner />
        <AppHeader
          active={{ id: active.id.toString(), name: active.name }}
          characters={characters.map((c) => ({ id: c.id, name: c.name, status: c.status }))}
        />
        <main className="w-full flex-1 px-4 py-6">{children}</main>
        <AppFooter />
        <Toaster />
      </div>
    </RealtimeProvider>
  );
}
