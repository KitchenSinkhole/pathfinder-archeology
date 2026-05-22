'use server';

import { signIn } from '@/lib/auth';

/** Begin EVE SSO login from the public splash, landing on the maps list. */
export async function loginAction(): Promise<void> {
  await signIn('eve', { redirectTo: '/maps' });
}
