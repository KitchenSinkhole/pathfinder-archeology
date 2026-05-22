'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { loginAction } from '@/app/(public)/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Redirecting…' : 'Log in with EVE Online'}
    </Button>
  );
}

export function LoginButton() {
  return (
    <form action={loginAction}>
      <SubmitButton />
    </form>
  );
}
