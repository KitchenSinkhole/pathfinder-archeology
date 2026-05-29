'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { MANUAL_SECTIONS } from '@/lib/reference/manual';

/**
 * Manual dialog (Stage 17.4) — a static user guide with a section nav and a
 * scrollspy body. Clicking a nav link scrolls the section into view; scrolling
 * the body highlights the section currently in view. Content comes from the
 * typed `MANUAL_SECTIONS` constant — no server call.
 */
export function ManualDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeId, setActiveId] = useState(MANUAL_SECTIONS[0]?.id ?? '');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  // While a click-driven scroll is animating, the IntersectionObserver would
  // otherwise fight it and flicker the active link through intermediate
  // sections. Suppress observer updates until the programmatic scroll settles.
  const suppressUntil = useRef(0);

  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressUntil.current) return;
        // Pick the entry nearest the top of the scroll container.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id;
        if (id) setActiveId(id);
      },
      { root, rootMargin: '0px 0px -60% 0px', threshold: 0 },
    );

    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const goTo = useCallback((id: string) => {
    suppressUntil.current = Date.now() + 500;
    setActiveId(id);
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manual</DialogTitle>
          <DialogDescription>How to use Aperture.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <nav className="hidden w-40 shrink-0 flex-col gap-0.5 sm:flex">
            {MANUAL_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                className={cn(
                  'rounded-md px-2 py-1 text-left text-xs transition-colors',
                  activeId === s.id
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.title}
              </button>
            ))}
          </nav>

          <div
            ref={scrollRef}
            className="flex max-h-[70vh] min-w-0 flex-1 flex-col gap-5 overflow-auto pr-1"
          >
            {MANUAL_SECTIONS.map((s) => (
              <section
                key={s.id}
                id={s.id}
                ref={(el) => {
                  if (el) sectionRefs.current.set(s.id, el);
                  else sectionRefs.current.delete(s.id);
                }}
                className="flex scroll-mt-2 flex-col gap-1.5"
              >
                <h3 className="font-heading text-sm font-medium text-foreground">{s.title}</h3>
                {s.body.map((p, i) => (
                  <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
