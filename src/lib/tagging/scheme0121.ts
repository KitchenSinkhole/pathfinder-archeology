// Stage 17.10 — Scheme B "0121". Positional chain numbering off the Home
// system: a tag is `parent_tag + next_unused_child_index` (indices start at 1).
// First hole off Home → `1`; first off `1` → `11`; second off `1` → `12`. The
// parent is resolved from the connection that links an untagged system to an
// already-tagged one (or to Home). Indices are reclaimed per-parent on delete.
// Pure / db-free.

import type { AvailableTags, TagContext, TagStrategy, TagSystem } from './types';

/** All tag strings currently in use on the map (uniqueness is what makes reclaim a set test). */
function usedTagSet(ctx: TagContext): Set<string> {
  const used = new Set<string>();
  for (const s of ctx.systems) if (s.tag) used.add(s.tag);
  return used;
}

/** Lowest free child tag for `parentTag` (prefix `''` for Home's direct children). */
function nextChildTag(used: Set<string>, parentTag: string): string {
  for (let i = 1; ; i++) {
    const candidate = parentTag + i;
    if (!used.has(candidate)) return candidate;
  }
}

export const scheme0121Strategy: TagStrategy = {
  // 0121 cannot tag at add time — the parent is only known once a connection lands.
  tagOnAdd() {
    return null;
  },

  tagOnConnect(
    ctx: TagContext,
    edge: { source: TagSystem; target: TagSystem },
  ): { mapSystemId: bigint; tag: string } | null {
    const { source, target } = edge;
    const isHome = (s: TagSystem) =>
      ctx.homeMapSystemId != null && s.mapSystemId === ctx.homeMapSystemId;

    // Resolve which endpoint is the parent (Home, or the tagged side) and which
    // is the untagged child. Bail unless exactly one valid parent/child split.
    let parent: TagSystem;
    let child: TagSystem;
    if (isHome(source) && !isHome(target)) {
      parent = source;
      child = target;
    } else if (isHome(target) && !isHome(source)) {
      parent = target;
      child = source;
    } else if (source.tag && !target.tag) {
      parent = source;
      child = target;
    } else if (target.tag && !source.tag) {
      parent = target;
      child = source;
    } else {
      return null;
    }

    // Never re-tag an already-tagged child; never tag Home itself.
    if (child.tag || isHome(child)) return null;

    const parentTag = isHome(parent) ? '' : parent.tag;
    if (parentTag == null) return null; // parent not yet rooted to Home → defer

    return { mapSystemId: child.mapSystemId, tag: nextChildTag(usedTagSet(ctx), parentTag) };
  },

  availableTags(ctx: TagContext, selectedMapSystemId: bigint | null): AvailableTags {
    const used = usedTagSet(ctx);
    const perParent: Array<{ parentMapSystemId: string | null; parentLabel: string; next: string }> = [];

    // Home's next root child is always useful to show.
    if (ctx.homeMapSystemId != null) {
      perParent.push({
        parentMapSystemId: ctx.homeMapSystemId.toString(),
        parentLabel: 'Home',
        next: nextChildTag(used, ''),
      });
    }

    // The selected system's next child, when it is a tagged non-Home node.
    if (selectedMapSystemId != null && selectedMapSystemId !== ctx.homeMapSystemId) {
      const selected = ctx.systems.find((s) => s.mapSystemId === selectedMapSystemId);
      if (selected?.tag) {
        perParent.push({
          parentMapSystemId: selected.mapSystemId.toString(),
          parentLabel: selected.tag,
          next: nextChildTag(used, selected.tag),
        });
      }
    }

    return { scheme: '0121', perParent };
  },
};
