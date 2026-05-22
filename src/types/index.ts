import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  apCharacter,
  apEventKind,
  apMap,
  apMapConnection,
  apMapEvent,
  apMapSignature,
  apMapSystem,
  apSystemStats,
  apUser,
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

export type ApUser = InferSelectModel<typeof apUser>;
export type NewApUser = InferInsertModel<typeof apUser>;

export type ApCharacter = InferSelectModel<typeof apCharacter>;
export type NewApCharacter = InferInsertModel<typeof apCharacter>;

export type ApMap = InferSelectModel<typeof apMap>;
export type NewApMap = InferInsertModel<typeof apMap>;

export type ApMapSystem = InferSelectModel<typeof apMapSystem>;
export type NewApMapSystem = InferInsertModel<typeof apMapSystem>;

export type ApMapConnection = InferSelectModel<typeof apMapConnection>;
export type NewApMapConnection = InferInsertModel<typeof apMapConnection>;

export type ApMapSignature = InferSelectModel<typeof apMapSignature>;
export type NewApMapSignature = InferInsertModel<typeof apMapSignature>;

export type ApMapEvent = InferSelectModel<typeof apMapEvent>;
export type NewApMapEvent = InferInsertModel<typeof apMapEvent>;

export type ApEventKind = InferSelectModel<typeof apEventKind>;
export type NewApEventKind = InferInsertModel<typeof apEventKind>;

export type ApSystemStats = InferSelectModel<typeof apSystemStats>;
export type NewApSystemStats = InferInsertModel<typeof apSystemStats>;

// Read-only map view-model types (shaped in src/lib/map/loadMap.ts).
export type {
  MapSystemNode,
  MapConnectionEdge,
  MapViewData,
  MapListItem,
} from '@/lib/map/loadMap';

// Route module view-model (computed in src/lib/map/route.ts).
export type { HubRoute } from '@/lib/map/route';

// Realtime WebSocket wire contracts (schemas in src/lib/realtime/protocol.ts).
export type {
  Envelope,
  ServerToClientTask,
  ClientToServerTask,
  ServerToClientMessage,
  ClientToServerMessage,
} from '@/lib/realtime/protocol';

// Realtime client connection status (provider in src/lib/realtime/useRealtime.tsx).
export type { RealtimeStatus } from '@/lib/realtime/useRealtime';

// Map-event payload contract (schemas in src/lib/realtime/protocol.ts).
export type { MapEventPayload, MapEventKind, MapEventPatch } from '@/lib/realtime/protocol';

// Map mutation core result type (src/lib/map/mutations/core.ts).
export type { ActionResult, CommitMapEventArgs } from '@/lib/map/mutations/core';

// ESI opKey identifiers (map in src/lib/esi/opkeys.ts).
export type { OpKey, OpDef } from '@/lib/esi/opkeys';

// ESI client decoded-response types (Stage 4).
export type { EsiStatus, EsiLocation, EsiRoute } from '@/lib/esi/decoders';
