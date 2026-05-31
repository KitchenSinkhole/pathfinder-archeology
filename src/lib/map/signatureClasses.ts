/**
 * Localized EVE probe-scanner "Class" column values.
 *
 * The scanner paste's second column carries the signature classification —
 * `Cosmic Signature` or `Cosmic Anomaly` — localized to the player's client
 * language. The paste parser matches the cell against this catalog primarily to
 * discard *other* classes of in-game signature (ships, deployables, drones,
 * structures, …) that are technically valid scanner entries but have no place on
 * a wormhole map; it also incidentally rejects unrelated tabular text that
 * happens to lead with an `AAA-NNN` token.
 *
 * Pure and client-safe (no DB, no `server-only`) so the paste dialog can
 * import it. Adding a new client language means appending one row below —
 * the single point of extension.
 *
 * Source: docs/reference/signature-scan-results.md §2.
 */

export type SignatureClassKind = 'signature' | 'anomaly';

export type SignatureClassOption = {
  /** Language code (en/de/fr/ru/ja/zh). */
  lang: string;
  /** Localized `Cosmic Anomaly` label. */
  anomaly: string;
  /** Localized `Cosmic Signature` label. */
  signature: string;
};

export const SIGNATURE_CLASS_CATALOG: readonly SignatureClassOption[] = [
  { lang: 'en', anomaly: 'Cosmic Anomaly',       signature: 'Cosmic Signature' },
  { lang: 'de', anomaly: 'Kosmische Anomalie',   signature: 'Kosmische Signatur' },
  { lang: 'fr', anomaly: 'Anomalie cosmique',    signature: 'Signature cosmique' },
  { lang: 'ru', anomaly: 'Космическая аномалия', signature: 'Скрытый сигнал' },
  { lang: 'ja', anomaly: '宇宙の特異点',          signature: '宇宙のシグネチャ' },
  { lang: 'zh', anomaly: '异常空间',              signature: '空间信号' },
];

const classNameToKind = new Map<string, SignatureClassKind>();
for (const c of SIGNATURE_CLASS_CATALOG) {
  classNameToKind.set(c.anomaly.toLowerCase(), 'anomaly');
  classNameToKind.set(c.signature.toLowerCase(), 'signature');
}

/**
 * Resolve a scanner-emitted Class cell to its kind, or `null` when the cell
 * is empty or matches no known localized class name. Case-insensitive,
 * trimmed.
 */
export function signatureClassKind(
  cell: string | null | undefined,
): SignatureClassKind | null {
  if (!cell) return null;
  return classNameToKind.get(cell.trim().toLowerCase()) ?? null;
}

/** True when the Class cell matches a known localized signature/anomaly label. */
export function isValidSignatureClass(cell: string | null | undefined): boolean {
  return signatureClassKind(cell) !== null;
}
