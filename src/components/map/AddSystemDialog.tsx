'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { searchSystemsOnServer } from '@/lib/map/client';
import type { SystemSearchResult } from '@/types';

const DEBOUNCE_MS = 200;

/**
 * "Add system manually" dialog (SPEC §6.5) — search the universe by name and
 * place a solar system on the map without a tracked character jumping a
 * wormhole into it. Selecting a result calls `onAdd(systemId)`; `MapCanvas`
 * owns the actual POST + optimistic apply and the placement position.
 */
export function AddSystemDialog({
  open,
  onOpenChange,
  mapId,
  existingSystemIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapId: string;
  /** EVE solar-system ids already visible on the map — flagged in the list. */
  existingSystemIds: Set<number>;
  onAdd: (systemId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SystemSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Drops out-of-order responses: only the latest issued request may commit.
  const requestSeq = useRef(0);

  // Debounced search. State updates happen inside the timer callback (not the
  // effect body) so the run keeps its own seq token and we don't trip the
  // synchronous-setState-in-effect rule. A query under 2 chars resolves to empty
  // without a round trip (the server would return [] anyway). `loading` is set
  // eagerly in the input handler so the spinner appears on the first keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      const data = trimmed.length < 2 ? [] : await fetchResults(trimmed);
      if (seq !== requestSeq.current) return;
      setResults(data);
      setActiveIndex(0);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);

    async function fetchResults(q: string): Promise<SystemSearchResult[]> {
      const result = await searchSystemsOnServer({ mapId, query: q });
      return result.ok ? result.data : [];
    }
  }, [query, mapId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Reset on close so the next open starts clean (all close paths — X,
      // overlay, Esc, selection — route through here).
      if (!next) {
        setQuery('');
        setResults([]);
        setLoading(false);
        setActiveIndex(0);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const choose = useCallback(
    (systemId: number) => {
      onAdd(systemId);
      handleOpenChange(false);
    },
    [onAdd, handleOpenChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = results[activeIndex];
        if (picked) choose(picked.id);
      }
    },
    [results, activeIndex, choose],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add system</DialogTitle>
          <DialogDescription>
            Search by name to place a system on the map without jumping a connection.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          {loading && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setLoading(next.trim().length >= 2);
            }}
            onKeyDown={onKeyDown}
            placeholder="System name, e.g. Jita or J123456"
            className="pl-8"
          />
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-md ring-1 ring-foreground/10">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {query.trim().length < 2
                ? 'Type at least two characters to search.'
                : loading
                  ? 'Searching…'
                  : 'No matching systems.'}
            </div>
          ) : (
            <ul>
              {results.map((s, i) => {
                const onMap = existingSystemIds.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => choose(s.id)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center justify-between gap-3 border-t border-foreground/10 px-3 py-2 text-left text-xs first:border-t-0 ${
                        i === activeIndex ? 'bg-muted/70' : 'hover:bg-muted/40'
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-foreground">
                          {s.name}
                          {onMap && (
                            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                              on map
                            </span>
                          )}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {s.regionName} / {s.constellationName}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                        {s.security ?? '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
