import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type {
  apCharacter,
  apCharacterRole,
  apCorporation,
  apCorporationRight,
  apEventKind,
  apMap,
  apMapConnection,
  apMapEvent,
  apMapRoleAccess,
  apMapSignature,
  apMapSystem,
  apMapTrackingSeed,
  apRole,
  apStructure,
  apStructureEvent,
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
  universeSovereigntyMap,
  universeFactionWarSystem,
  universeType,
  universeTypeAttribute,
  universeTypeOverride,
  universeWormhole,
} from '@/db/schema';
import type {
  authzLevel,
  mapRight,
  mapType,
  roleSource,
  signatureGroupKey,
  structureEventKind,
  tagScheme,
} from '@/db/schema/ap/enums';

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

export type UniverseSovereigntyMap = InferSelectModel<typeof universeSovereigntyMap>;
export type NewUniverseSovereigntyMap = InferInsertModel<typeof universeSovereigntyMap>;

export type UniverseFactionWarSystem = InferSelectModel<typeof universeFactionWarSystem>;
export type NewUniverseFactionWarSystem = InferInsertModel<typeof universeFactionWarSystem>;

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

export type ApMapTrackingSeed = InferSelectModel<typeof apMapTrackingSeed>;
export type NewApMapTrackingSeed = InferInsertModel<typeof apMapTrackingSeed>;

export type ApEventKind = InferSelectModel<typeof apEventKind>;
export type NewApEventKind = InferInsertModel<typeof apEventKind>;

export type ApSystemStats = InferSelectModel<typeof apSystemStats>;
export type NewApSystemStats = InferInsertModel<typeof apSystemStats>;

export type ApCorporation = InferSelectModel<typeof apCorporation>;
export type NewApCorporation = InferInsertModel<typeof apCorporation>;

export type ApRole = InferSelectModel<typeof apRole>;
export type NewApRole = InferInsertModel<typeof apRole>;

export type ApCharacterRole = InferSelectModel<typeof apCharacterRole>;
export type NewApCharacterRole = InferInsertModel<typeof apCharacterRole>;

export type ApMapRoleAccess = InferSelectModel<typeof apMapRoleAccess>;
export type NewApMapRoleAccess = InferInsertModel<typeof apMapRoleAccess>;

export type ApCorporationRight = InferSelectModel<typeof apCorporationRight>;
export type NewApCorporationRight = InferInsertModel<typeof apCorporationRight>;

export type ApStructure = InferSelectModel<typeof apStructure>;
export type NewApStructure = InferInsertModel<typeof apStructure>;

export type ApStructureEvent = InferSelectModel<typeof apStructureEvent>;
export type NewApStructureEvent = InferInsertModel<typeof apStructureEvent>;

// Stage 15 enum unions. `pgEnum` exposes its values via `.enumValues`; the
// `[number]` index extracts the union of string literals.
export type AuthzLevel = (typeof authzLevel.enumValues)[number];
export type MapRight = (typeof mapRight.enumValues)[number];
export type MapType = (typeof mapType.enumValues)[number];
export type RoleSource = (typeof roleSource.enumValues)[number];
export type SignatureGroupKey = (typeof signatureGroupKey.enumValues)[number];
export type StructureEventKind = (typeof structureEventKind.enumValues)[number];
export type TagScheme = (typeof tagScheme.enumValues)[number];
/** The six cosmic-signature groups (every group except `wormhole`). Their site
 * names are baked into the EVE client and have no SDE rows, so they're carried
 * as free-text `name` strings rather than a `typeId` FK. */
export type CosmicSignatureGroupKey = Exclude<SignatureGroupKey, 'wormhole'>;

// Read-only map view-model types (shaped in src/lib/map/loadMap.ts).
export type {
  MapSystemNode,
  MapConnectionEdge,
  MapSignature,
  MapPresenceEntry,
  MapViewData,
  MapListItem,
  MapSettings,
  AdminMapListItem,
} from '@/lib/map/loadMap';

// Map import/export document + result types (src/lib/map/transfer.ts).
export type { MapExportFile, ImportSummary, ImportResult } from '@/lib/map/transfer';

// Thera module view-model + sync types (Stage 17.9, src/lib/map/thera.ts).
export type { TheraHub, TheraConnection, TheraSyncInput, TheraSyncResult } from '@/lib/map/thera';

// Auto-tagging strategy contract + view-model (Stage 17.10, src/lib/tagging/types.ts).
export type {
  ActiveScheme,
  TagSystem,
  TagEdge,
  TagContext,
  TagStrategy,
  AvailableTags,
} from '@/lib/tagging/types';

// Route module view-model (computed in src/lib/map/route.ts).
export type { HubRoute } from '@/lib/map/route';

// Read-side intel module view-models (computed in src/lib/map/intel.ts).
export type {
  SovereigntyIntel,
  FactionWarIntel,
  SystemExternalLinks,
  SystemIntelSummary,
} from '@/lib/map/intel';

// Third-party read-side integration summaries.
export type { RecentKillSummary } from '@/lib/integrations/zkb';
export type { EveScoutConnectionSummary } from '@/lib/integrations/evescout';
export type { ChangelogRelease } from '@/lib/integrations/github';

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

// System mutation input types (src/lib/map/mutations/systems.ts).
export type {
  AddSystemInput,
  RemoveSystemInput,
  UpdateSystemInput,
  UpdateSystemPatch,
} from '@/lib/map/mutations/systems';

// Connection mutation input types (src/lib/map/mutations/connections.ts).
export type {
  CreateConnectionInput,
  DeleteConnectionInput,
  UpdateConnectionInput,
  UpdateConnectionPatch,
} from '@/lib/map/mutations/connections';

// Signature mutation input types (src/lib/map/mutations/signatures.ts).
export type {
  CreateSignatureInput,
  UpdateSignatureInput,
  UpdateSignaturePatch,
  DeleteSignatureInput,
} from '@/lib/map/mutations/signatures';

// Bulk signature-paste orchestrator types (src/lib/map/mutations/bulkSignatures.ts).
export type {
  BulkPasteOptions,
  BulkPasteSummary,
  BulkPasteResult,
  PasteSignaturesInput,
} from '@/lib/map/mutations/bulkSignatures';

// Wormhole-catalog lookup result types (src/lib/map/wormholeTypes.ts).
export type { WormholeTypeOption, StaticMatch } from '@/lib/map/wormholeTypes';

// Solar-system name search result (src/lib/map/systemSearch.ts).
export type { SystemSearchResult } from '@/lib/map/systemSearch';

// Read-side structure-intel view-models (computed in src/lib/structures/read.ts).
export type { StructureIntel, UpwellStructureType } from '@/lib/structures/read';

// Corporation name-search result for the structure owner picker (src/lib/structures/corpSearch.ts).
export type { CorpSearchResult } from '@/lib/structures/corpSearch';

// Structure mutation input types (src/lib/structures/mutations.ts).
export type {
  CreateStructureInput,
  UpdateStructureInput,
  UpdateStructurePatch,
  DeleteStructureInput,
} from '@/lib/structures/mutations';

// Shared JSON fetch result (src/lib/http/fetchJson.ts).
export type { FetchResult } from '@/lib/http/fetchJson';

// Structure client request-body shapes (src/lib/structures/client.ts).
export type { CreateStructureBody, UpdateStructureBody } from '@/lib/structures/client';

// Signature paste parser + resolver (src/lib/map/signatureParser.ts, signatureReader.ts).
export type { ParsedSigRow } from '@/lib/map/signatureParser';
export type { ResolvedSigRow } from '@/lib/map/signatureReader';

// Scanner-level signature group catalog (src/lib/map/signatureGroups.ts).
export type { SignatureGroupOption } from '@/lib/map/signatureGroups';

// Localized signature Class catalog (src/lib/map/signatureClasses.ts).
export type { SignatureClassKind, SignatureClassOption } from '@/lib/map/signatureClasses';

// ESI opKey identifiers (map in src/lib/esi/opkeys.ts).
export type { OpKey, OpDef } from '@/lib/esi/opkeys';

// Static reference data for the Stage 17.3 dialogs.
export type { SystemEffect, SystemEffectBonus, SystemEffectKey } from '@/lib/eve/systemEffects';
export type { WormholeJumpInfoRow } from '@/lib/eve/wormholeJumpInfo';

// Activity-statistics view-models (Stage 17.7, computed in src/lib/stats/activity.ts).
export type {
  ActivityStatScope,
  ActivityStatPeriod,
  ActivityTriplet,
  ActivityStatRow,
  ActivityStatsResponse,
} from '@/lib/stats/activity';

// ESI client decoded-response types (Stage 4).
export type {
  EsiStatus,
  EsiLocation,
  EsiRoute,
  EsiSovereigntyMap,
  EsiFactionWarSystems,
} from '@/lib/esi/decoders';

/**
 * Visual configuration for a map-node "underglow" — a pulsing colored glow
 * rendered beneath a `SystemNode` (Stage 17.8). The component is intentionally
 * notification-agnostic; callers (`underglowPresets.ts`) pick the look per
 * notification kind (killmail = red, future rally/unscanned-sig presets, …).
 */
export type UnderglowConfig = {
  /** Any CSS color. */
  color: string;
  /** Peak glow intensity, 0..1. */
  brightness: number;
  /** Transient lifetime in ms; `0` ⇒ persistent until explicitly cleared. */
  durationMs: number;
  /** Duration of one pulse cycle in ms. */
  speedMs: number;
};
