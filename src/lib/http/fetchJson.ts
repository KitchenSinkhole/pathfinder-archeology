import { toast } from 'sonner';

/**
 * Shared browser-side JSON fetch core for the app's JSON API routes. Folds every
 * non-2xx response and thrown network error into `{ ok: false, error }` and
 * surfaces a `toast.error` so call sites never duplicate the toast.
 *
 * `requestJson` is generic over the *full* success union the route returns, so
 * different resources keep their own result shape: map mutations carry an
 * `eventId` (`ActionResult<T>`), plain REST resources don't (`FetchResult<T>`).
 */

/** Result of a route that returns `{ ok, data }` with no `eventId` (GET + non-map mutations). */
export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function requestJson<J extends { ok: boolean; error?: string }>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<J | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => null)) as J | null;
    if (!json) {
      const error = `Request failed (${res.status}).`;
      toast.error(error);
      return { ok: false, error };
    }
    if (!json.ok) toast.error(json.error ?? `Request failed (${res.status}).`);
    return json;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error.';
    toast.error(error);
    return { ok: false, error };
  }
}
