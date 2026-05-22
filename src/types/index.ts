import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  universeCategory,
  universeConstellation,
  universeDogmaAttribute,
  universeGroup,
  universeRegion,
  universeStargateEdge,
  universeSystem,
  universeSystemStatic,
  universeType,
  universeTypeAttribute,
  universeTypeOverride,
  universeWormhole,
} from '@/db/schema';

export type UniverseRegion = InferSelectModel<typeof universeRegion>;
export type NewUniverseRegion = InferInsertModel<typeof universeRegion>;

export type UniverseConstellation = InferSelectModel<typeof universeConstellation>;
export type NewUniverseConstellation = InferInsertModel<typeof universeConstellation>;

export type UniverseSystem = InferSelectModel<typeof universeSystem>;
export type NewUniverseSystem = InferInsertModel<typeof universeSystem>;

export type UniverseStargateEdge = InferSelectModel<typeof universeStargateEdge>;
export type NewUniverseStargateEdge = InferInsertModel<typeof universeStargateEdge>;

export type UniverseCategory = InferSelectModel<typeof universeCategory>;
export type NewUniverseCategory = InferInsertModel<typeof universeCategory>;

export type UniverseGroup = InferSelectModel<typeof universeGroup>;
export type NewUniverseGroup = InferInsertModel<typeof universeGroup>;

export type UniverseType = InferSelectModel<typeof universeType>;
export type NewUniverseType = InferInsertModel<typeof universeType>;

export type UniverseDogmaAttribute = InferSelectModel<typeof universeDogmaAttribute>;
export type NewUniverseDogmaAttribute = InferInsertModel<typeof universeDogmaAttribute>;

export type UniverseTypeAttribute = InferSelectModel<typeof universeTypeAttribute>;
export type NewUniverseTypeAttribute = InferInsertModel<typeof universeTypeAttribute>;

export type UniverseTypeOverride = InferSelectModel<typeof universeTypeOverride>;
export type NewUniverseTypeOverride = InferInsertModel<typeof universeTypeOverride>;

export type UniverseSystemStatic = InferSelectModel<typeof universeSystemStatic>;
export type NewUniverseSystemStatic = InferInsertModel<typeof universeSystemStatic>;

export type UniverseWormhole = InferSelectModel<typeof universeWormhole>;
export type NewUniverseWormhole = InferInsertModel<typeof universeWormhole>;
