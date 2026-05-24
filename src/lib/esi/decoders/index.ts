/**
 * ESI response decoders. Each is a Zod schema matching the swagger 200-response
 * shape for one operation; the client parses every response through one so ESI
 * schema drift fails loudly instead of cascading as silent `undefined`.
 *
 * Stage 4 seeds only the substrate set (status / location / route) used to
 * prove decoding. Consuming stages (7, 10, 12, 13) add their own decoders here.
 */
export { statusSchema, type EsiStatus } from './status';
export { locationSchema, type EsiLocation } from './location';
export { routeSchema, type EsiRoute } from './route';
export { characterOnlineSchema, type EsiCharacterOnline } from './online';
export { characterShipSchema, type EsiCharacterShip } from './ship';
export {
  universeSystemJumpsSchema,
  universeSystemKillsSchema,
  type EsiUniverseSystemJumps,
  type EsiUniverseSystemKills,
} from './systemActivity';
