'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setupUnlockAction } from '@/app/(setup)/actions';

export function SetupUnlockForm() {
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length === 0) {
      toast.error('Enter the setup password.');
      return;
    }
    startTransition(async () => {
      const result = await setupUnlockAction(password);
      if (result.ok) {
        toast.success('Unlocked.');
        setPassword('');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">Setup password</span>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          placeholder="SETUP_PASSWORD value from .env"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Unlocking…' : 'Unlock'}
      </Button>
    </form>
  );
}
