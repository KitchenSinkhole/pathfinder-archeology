import { handlers } from '@/lib/auth';

// crypto (node:crypto) + pg require the Node runtime, not Edge.
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
