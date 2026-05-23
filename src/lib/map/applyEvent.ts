import type { MapConnectionEdge, MapSystemNode, MapViewData } from '@/types';
import type { MapEventPayload } from '@/lib/realtime/protocol';

/**
 * Pure reducer: apply one realtime map event to the current canvas view state.
 * Returns a new `MapViewData` (never mutates). Called on the client inside a
 * `useState` + `useEffect` pair in `MapCanvas.tsx`.
 *
 * Signature and map lifecycle events (`signature.*`, `map.create`, `map.delete`)
 * have no representation in `MapViewData`; they are no-ops here. `map.delete`
 * navigation is handled by the separate `mapDeleted` WS task.
 */
export function applyEvent(state: MapViewData, payload: MapEventPayload): MapViewData {
  switch (payload.kind) {
    case 'system.added': {
      // payload structurally satisfies MapSystemNode (contains all required fields).
      const nodeData = payload as MapSystemNode;
      const exists = state.systems.some((s) => s.id === nodeData.id);
      if (exists) {
        return {
          ...state,
          systems: state.systems.map((s) => (s.id === nodeData.id ? nodeData : s)),
        };
      }
      return { ...state, systems: [...state.systems, nodeData] };
    }

    case 'system.removed':
      return { ...state, systems: state.systems.filter((s) => s.id !== payload.id) };

    case 'system.updated': {
      return {
        ...state,
        systems: state.systems.map((s): MapSystemNode => {
          if (s.id !== payload.id) return s;
          const next = { ...s };
          if (payload.alias !== undefined) next.alias = payload.alias;
          if (payload.tag !== undefined) next.tag = payload.tag;
          if (payload.status !== undefined) next.status = payload.status;
          if (payload.locked !== undefined) next.locked = payload.locked;
          if (payload.positionX !== undefined) next.positionX = payload.positionX;
          if (payload.positionY !== undefined) next.positionY = payload.positionY;
          // intelNotes and rallyAt are not in MapViewData; silently skipped.
          return next;
        }),
      };
    }

    case 'connection.create':
      // payload structurally satisfies MapConnectionEdge.
      return { ...state, connections: [...state.connections, payload as MapConnectionEdge] };

    case 'connection.update': {
      return {
        ...state,
        connections: state.connections.map((c): MapConnectionEdge => {
          if (c.id !== payload.id) return c;
          const next = { ...c };
          if (payload.scope !== undefined) next.scope = payload.scope;
          if (payload.massStatus !== undefined) next.massStatus = payload.massStatus;
          if (payload.jumpMassClass !== undefined) next.jumpMassClass = payload.jumpMassClass;
          if (payload.isEol !== undefined) next.isEol = payload.isEol;
          if (payload.isFrigate !== undefined) next.isFrigate = payload.isFrigate;
          if (payload.preserveMass !== undefined) next.preserveMass = payload.preserveMass;
          if (payload.isRolling !== undefined) next.isRolling = payload.isRolling;
          // eolAt is not in MapConnectionEdge; silently skipped.
          return next;
        }),
      };
    }

    case 'connection.delete':
      return { ...state, connections: state.connections.filter((c) => c.id !== payload.id) };

    case 'map.update': {
      if (payload.name === undefined) return state;
      return { ...state, map: { ...state.map, name: payload.name } };
    }

    case 'signature.create':
    case 'signature.update':
    case 'signature.delete':
    case 'map.create':
    case 'map.delete':
      return state;

    default:
      return state;
  }
}
