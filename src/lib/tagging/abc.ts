// Stage 17.10 — Scheme A "ABC". Each WH class carries its own independent
// sequence of letters (A, B, C, …); the lowest free letter is always assigned,
// so deleting a tagged system reclaims its letter. K-space and class-less
// systems are not tagged. Pure / db-free.

import type { AvailableTags, TagContext, TagStrategy, TagSystem } from './types';

/** Canonical WH classes always shown in the panel grid, even before discovery. */
const DEFAULT_ABC_CLASSES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

/**
 * True for a security label that gets its own ABC letter sequence. The
 * `universe_system.security` label is `Cn` for wormhole space (`deriveSecurityLabel`),
 * so ABC tags wormhole systems and leaves k-space (`H`/`L`/`0.0`), Abyssal (`A`),
 * and Pochven (`P`) untagged.
 */
function isTaggableClass(securityClass: string | null): securityClass is string {
  return securityClass != null && securityClass.startsWith('C');
}

/** 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB", … (bijective base-26, spreadsheet-column style). */
function letterForIndex(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Inverse of `letterForIndex`. "A" → 0, "AA" → 26. Returns null for a non-letter token. */
function indexForLetter(token: string): number | null {
  if (!/^[A-Z]+$/.test(token)) return null;
  let n = 0;
  for (const ch of token) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The set of letter ordinals currently used by visible systems of `classLabel`. */
function usedIndicesForClass(ctx: TagContext, classLabel: string): Set<number> {
  const used = new Set<number>();
  for (const s of ctx.systems) {
    if (s.securityClass !== classLabel || !s.tag) continue;
    const idx = indexForLetter(s.tag);
    if (idx != null) used.add(idx);
  }
  return used;
}

/** The lowest `count` free letter ordinals for a class, as letter tokens. */
function lowestFreeLetters(used: Set<number>, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < count; i++) {
    if (!used.has(i)) out.push(letterForIndex(i));
  }
  return out;
}

export const abcStrategy: TagStrategy = {
  tagOnAdd(ctx: TagContext, subject: TagSystem): string | null {
    if (!isTaggableClass(subject.securityClass)) return null;
    const used = usedIndicesForClass(ctx, subject.securityClass);
    return lowestFreeLetters(used, 1)[0]!;
  },

  // ABC assigns purely from class at add time; topology is irrelevant.
  tagOnConnect() {
    return null;
  },

  availableTags(ctx: TagContext): AvailableTags {
    const present = ctx.systems
      .map((s) => s.securityClass)
      .filter(isTaggableClass);
    // Canonical C1–C6 always, plus any other taggable class currently on the map.
    const classes = [...new Set([...DEFAULT_ABC_CLASSES, ...present])];
    return {
      scheme: 'abc',
      perClass: classes.map((classLabel) => ({
        classLabel,
        next: lowestFreeLetters(usedIndicesForClass(ctx, classLabel), 3),
      })),
    };
  },
};
