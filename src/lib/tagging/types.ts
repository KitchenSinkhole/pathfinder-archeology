// Stage 17.10 auto-tagging. The strategy contract every scheme implements, plus
// the read-only context the schemes operate over. Everything here is PURE and
// db-free: the same functions run server-side (assignment, inside a mutation
// transaction) and client-side (the `TagsModule` panel, over `viewData`). The
// db-aware layer is `service.ts`; it builds a `TagContext` and dispatches to the
// strategy resolved from `registry.ts`.

/** The two schemes that actually run a strategy. `none` short-circuits before any strategy is consulted. */
export type ActiveScheme = 'abc' | '0121';

/** One visible system in the tagging snapshot. */
export interface TagSystem {
  mapSystemId: bigint;
  /** EVE solar-system id (`universe_system.id`). */
  systemId: number;
  /** Currently-assigned tag (bare token, e.g. `B` or `121`), or null. */
  tag: string | null;
  /** `universe_system.security` label (`deriveSecurityLabel`): `C1`..`Cn` (wormhole), `H`/`L`/`0.0` (k-space), `A`/`P`, or null. */
  securityClass: string | null;
}

/** One connection, endpoints as `ap_map_system.id`. Direction is ignored by the schemes. */
export interface TagEdge {
  source: bigint;
  target: bigint;
}

/** A read-only snapshot of one map's tag-relevant state. Visible systems + their connections. */
export interface TagContext {
  scheme: ActiveScheme;
  /** The map's designated Home (`ap_map.home_map_system_id`), the 0121 root. */
  homeMapSystemId: bigint | null;
  systems: TagSystem[];
  connections: TagEdge[];
}

/** The side-panel view-model for the active scheme. */
export type AvailableTags =
  | { scheme: 'abc'; perClass: Array<{ classLabel: string; next: string[] }> }
  | {
      scheme: '0121';
      perParent: Array<{
        parentMapSystemId: string | null;
        parentLabel: string;
        next: string;
      }>;
    };

export interface TagStrategy {
  /**
   * The tag to assign a system at DISCOVERY (add) time, or null to defer/skip.
   * ABC computes from the system's WH class; 0121 returns null (the parent is
   * unknown until a connection lands — see `tagOnConnect`).
   */
  tagOnAdd(ctx: TagContext, subject: TagSystem): string | null;
  /**
   * After a connection is created, the tag a now-connected untagged system
   * should receive, or null. 0121 resolves the parent from the edge (the tagged
   * endpoint, or Home) and numbers the untagged child; ABC returns null.
   */
  tagOnConnect(
    ctx: TagContext,
    edge: { source: TagSystem; target: TagSystem },
  ): { mapSystemId: bigint; tag: string } | null;
  /** The "next available" panel view-model for the current selection. */
  availableTags(ctx: TagContext, selectedMapSystemId: bigint | null): AvailableTags;
}
