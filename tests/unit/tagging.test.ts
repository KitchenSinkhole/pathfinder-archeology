import { describe, it, expect } from 'vitest';
import { abcStrategy } from '@/lib/tagging/abc';
import { scheme0121Strategy } from '@/lib/tagging/scheme0121';
import type { TagContext, TagSystem } from '@/lib/tagging/types';

// Pure-strategy tests for the Stage 17.10 auto-tagging schemes. No db.

const sys = (id: number, securityClass: string | null, tag: string | null): TagSystem => ({
  mapSystemId: BigInt(id),
  systemId: 30000000 + id,
  tag,
  securityClass,
});

const abcCtx = (systems: TagSystem[]): TagContext => ({
  scheme: 'abc',
  homeMapSystemId: null,
  systems,
  connections: [],
});

describe('ABC strategy', () => {
  it('assigns the lowest free letter per class, independently', () => {
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(1, 'C1', null))).toBe('A');
    expect(abcStrategy.tagOnAdd(abcCtx([sys(1, 'C1', 'A')]), sys(2, 'C1', null))).toBe('B');
    expect(
      abcStrategy.tagOnAdd(
        abcCtx([sys(1, 'C1', 'A'), sys(2, 'C1', 'B'), sys(3, 'C1', 'C')]),
        sys(4, 'C1', null),
      ),
    ).toBe('D');
    // C2 keeps its own sequence regardless of C1.
    expect(abcStrategy.tagOnAdd(abcCtx([sys(1, 'C1', 'A')]), sys(2, 'C2', null))).toBe('A');
  });

  it('reclaims a freed letter (lowest free, not next)', () => {
    // B is gone → the next C1 reclaims B, not D.
    expect(
      abcStrategy.tagOnAdd(abcCtx([sys(1, 'C1', 'A'), sys(3, 'C1', 'C')]), sys(4, 'C1', null)),
    ).toBe('B');
  });

  it('does not tag k-space / Abyssal / Pochven / class-less systems', () => {
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(1, 'H', null))).toBeNull();
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(2, 'L', null))).toBeNull();
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(3, '0.0', null))).toBeNull();
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(4, 'A', null))).toBeNull();
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(5, 'P', null))).toBeNull();
    expect(abcStrategy.tagOnAdd(abcCtx([]), sys(6, null, null))).toBeNull();
  });

  it('continues past Z into multi-letter tokens', () => {
    const used = Array.from({ length: 26 }, (_, i) =>
      sys(i + 1, 'C1', String.fromCharCode(65 + i)),
    );
    expect(abcStrategy.tagOnAdd(abcCtx(used), sys(99, 'C1', null))).toBe('AA');
  });

  it('availableTags lists the next three free letters per class', () => {
    const out = abcStrategy.availableTags(abcCtx([sys(1, 'C1', 'A'), sys(2, 'C1', 'C')]), null);
    if (out.scheme !== 'abc') throw new Error('expected abc');
    const c1 = out.perClass.find((r) => r.classLabel === 'C1')!;
    expect(c1.next).toEqual(['B', 'D', 'E']);
    // C2 is in the always-shown grid even with no systems yet.
    const c2 = out.perClass.find((r) => r.classLabel === 'C2')!;
    expect(c2.next).toEqual(['A', 'B', 'C']);
  });
});

const HOME = 100;

const chainCtx = (systems: TagSystem[]): TagContext => ({
  scheme: '0121',
  homeMapSystemId: BigInt(HOME),
  systems,
  connections: [],
});

describe('0121 strategy', () => {
  const home = sys(HOME, null, null);

  it('numbers the first hole off Home as 1', () => {
    const child = sys(1, 'C3', null);
    const out = scheme0121Strategy.tagOnConnect(chainCtx([home, child]), {
      source: home,
      target: child,
    });
    expect(out).toEqual({ mapSystemId: BigInt(1), tag: '1' });
  });

  it('appends the child index to the parent tag', () => {
    const parent = sys(1, 'C3', '1');
    const child = sys(2, 'C3', null);
    const out = scheme0121Strategy.tagOnConnect(chainCtx([home, parent, child]), {
      source: parent,
      target: child,
    });
    expect(out).toEqual({ mapSystemId: BigInt(2), tag: '11' });
  });

  it('numbers siblings in order and reclaims per-parent', () => {
    // Parent 1 already has child 11; the next child is 12.
    const parent = sys(1, 'C3', '1');
    const c11 = sys(2, 'C3', '11');
    const next = sys(3, 'C3', null);
    expect(
      scheme0121Strategy.tagOnConnect(chainCtx([home, parent, c11, next]), {
        source: parent,
        target: next,
      }),
    ).toEqual({ mapSystemId: BigInt(3), tag: '12' });

    // With 11 removed (only 12 remains visible), the next child reclaims 11.
    const c12 = sys(4, 'C3', '12');
    expect(
      scheme0121Strategy.tagOnConnect(chainCtx([home, parent, c12, next]), {
        source: parent,
        target: next,
      }),
    ).toEqual({ mapSystemId: BigInt(3), tag: '11' });
  });

  it('defers when the split is ambiguous or the child is already tagged', () => {
    const a = sys(1, 'C3', '1');
    const b = sys(2, 'C3', '11');
    // both tagged
    expect(scheme0121Strategy.tagOnConnect(chainCtx([home, a, b]), { source: a, target: b })).toBeNull();
    // both untagged
    const u1 = sys(3, 'C3', null);
    const u2 = sys(4, 'C3', null);
    expect(scheme0121Strategy.tagOnConnect(chainCtx([u1, u2]), { source: u1, target: u2 })).toBeNull();
  });

  it('never tags at add time', () => {
    expect(scheme0121Strategy.tagOnAdd(chainCtx([home]), sys(1, 'C3', null))).toBeNull();
  });

  it('availableTags shows Home next and the selected parent next', () => {
    const c1 = sys(1, 'C3', '1');
    const out = scheme0121Strategy.availableTags(chainCtx([home, c1]), BigInt(1));
    if (out.scheme !== '0121') throw new Error('expected 0121');
    const homeRow = out.perParent.find((r) => r.parentLabel === 'Home')!;
    expect(homeRow.next).toBe('2'); // 1 is taken
    const parentRow = out.perParent.find((r) => r.parentLabel === '1')!;
    expect(parentRow.next).toBe('11');
  });
});
