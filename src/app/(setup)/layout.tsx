import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-amber-500/40 bg-amber-500/10 text-amber-200">
        <div className="mx-auto max-w-3xl px-4 py-3 text-sm">
          <strong className="font-medium">Operator console.</strong>{' '}
          Bypasses EVE SSO &mdash; gated by <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs">SETUP_PASSWORD</code>.
          Rotate the password after every operator-team change.
        </div>
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
