export type CcpImageCategory = 'characters' | 'corporations' | 'alliances' | 'types';

const DOTLAN_BASE = 'https://evemaps.dotlan.net';
const EVEEYE_BASE = 'https://eveeye.com';
const ANOIK_BASE = 'https://anoik.is';
const ZKILLBOARD_BASE = 'https://zkillboard.com';
const CCP_IMAGES_BASE = 'https://images.evetech.net';

function dotlanName(systemName: string): string {
  return encodeURIComponent(systemName.replaceAll(' ', '_'));
}

export function dotlanSystemUrl(systemName: string): string {
  return `${DOTLAN_BASE}/system/${dotlanName(systemName)}`;
}

export function eveeyeSystemUrl(systemId: number): string {
  return `${EVEEYE_BASE}/?system=${systemId}`;
}

export function anoikSystemUrl(systemName: string): string {
  return `${ANOIK_BASE}/systems/${dotlanName(systemName)}`;
}

export function zkillboardSystemUrl(systemId: number): string {
  return `${ZKILLBOARD_BASE}/system/${systemId}/`;
}

export function ccpImageUrl(
  category: CcpImageCategory,
  id: number | bigint,
  variation = 'portrait',
  size = 64,
): string {
  return `${CCP_IMAGES_BASE}/${category}/${id}/${variation}?size=${size}`;
}
