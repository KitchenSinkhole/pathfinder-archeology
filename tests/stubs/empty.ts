// Noop stub aliased over `server-only` / `client-only` in vitest. Those packages
// throw at import time outside the Next bundler's react-server condition, which
// would otherwise break tests that import server-only modules (e.g. session.ts).
export {};
