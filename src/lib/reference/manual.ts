/**
 * User-guide content for the Manual dialog (Stage 17.4). Authored as a typed
 * constant rather than ported from the legacy HTML template — sections drive
 * both the scrollspy nav and the rendered body. Keep prose concise; this is a
 * quick-reference, not exhaustive docs.
 */
export type ManualSection = {
  /** Stable anchor id; used for `scrollIntoView` and IntersectionObserver. */
  id: string;
  title: string;
  /** Each string renders as one paragraph. */
  body: string[];
};

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    body: [
      'Aperture is a collaborative wormhole-mapping tool. Pick a map from your maps list to open its chain. Everyone with access to a map sees the same systems and connections in real time.',
      'The canvas in the centre is the chain. The panels on the right inspect whatever system or connection you have selected. The signature table sits below the canvas.',
    ],
  },
  {
    id: 'systems',
    title: 'Systems & the canvas',
    body: [
      'Click a system to select it — its details, route, intel, structures and kill stats fill the sidebar. Drag a system to reposition it; the new position is saved for everyone.',
      'Edit a system’s alias or tag inline from its tile. Change its status from the inspector. Locked systems are protected from accidental edits.',
      'Pan and zoom with the canvas controls; your view position is remembered per map. Drag the handle under the canvas to resize it.',
    ],
  },
  {
    id: 'signatures',
    title: 'Signatures',
    body: [
      'The signature table lists every scanned signature in the selected system. Add rows manually, or paste the in-game probe-scanner output to import a whole system at once.',
      'Resolving a wormhole signature to a type links it to the matching connection so mass and lifetime are tracked together.',
    ],
  },
  {
    id: 'connections',
    title: 'Connections & mass',
    body: [
      'Drag from one system’s edge handle to another to create a wormhole connection. Select a connection to set its scope, mass status (fresh / reduced / critical), jump-mass size and end-of-life flag.',
      'Connections are hard-deleted when a hole collapses — they do not come back. End-of-life and expired connections can be cleaned up automatically per map settings.',
    ],
  },
  {
    id: 'tracking',
    title: 'Realtime & tracking',
    body: [
      'Changes from other pilots appear live over a shared connection. If realtime degrades, a banner warns you so you never act on stale state.',
      'Tracked characters’ locations are polled server-side and shown as pilot badges on their current system. The Map Info dialog’s Users tab lists everyone currently online on the map.',
    ],
  },
  {
    id: 'reference',
    title: 'Reference dialogs',
    body: [
      'The Info menu in the header opens reference data: System Effects (W-space anomaly bonuses by class), Jump Info (wormhole mass, lifetime and statics) and this Manual.',
      'The Map Info button above the canvas opens a live snapshot of the current map: summary counts, the full system and connection lists, and the online pilot roster.',
    ],
  },
];
