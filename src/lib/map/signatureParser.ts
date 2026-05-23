/**
 * Signature paste parser — pure, client-safe parser for the EVE in-game
 * probe-scanner clipboard format.
 *
 * Split from `signatureReader.ts` so the parser can be imported from client
 * components (the paste dialog) without dragging in the DB-bound resolver,
 * which is `server-only`.
 *
 * The EVE client emits **5 tab-separated columns** in fixed order:
 * `Distance, ID, Name, Group, Signal`. The probe scanner never includes a
 * wormhole-type code (`A239` / `K162` / …) in the paste — that's only knowable
 * after warping in. Manual WH-code entry lives in the existing
 * `WormholeTypeSelect` dropdown on each sig row.
 *
 * The legacy `docs/spec/08-frontend-ui-modules.md:139` documents the columns as
 * `<id> <group> <name> <%> <distance>` — that's wrong for the current client.
 */

export type ParsedSigRow = {
  /** In-game 3-char + 3-digit id, e.g. `ABC-123`. Always uppercased. */
  sigId: string;
  /** Site name cell (`universe_type.name`), `null` when blank in the paste. */
  name: string | null;
  /** Group cell (`universe_group.name`), `null` when blank in the paste. */
  groupName: string | null;
  /** Signal-strength cell as printed (e.g. `100.0%`, `4.2%`), `null` if absent. */
  signal: string | null;
};

const SIG_ID_RE = /^[A-Z]{3}-\d{3}$/i;
// First cell must look like a distance (`1.23 AU`, `4 230 km`, `-` for unresolved).
const DISTANCE_RE = /^(?:-|[\d.,\s]+\s*(?:AU|km|m))$/i;

/**
 * Split clipboard text into structured rows. Pure: no DB calls, no `Date.now()`.
 * Skips blanks, header lines, and rows whose first cell isn't a Distance.
 * Tolerates clipboards that strip tabs by also splitting on 2+ spaces.
 */
export function parseSignaturePaste(text: string): ParsedSigRow[] {
  const out: ParsedSigRow[] = [];
  if (typeof text !== 'string' || text.length === 0) return out;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.length === 0) continue;

    const cells = line.includes('\t') ? line.split('\t') : line.split(/ {2,}/);
    if (cells.length < 2) continue;

    const distance = cells[0]?.trim() ?? '';
    if (!DISTANCE_RE.test(distance)) continue; // header row or garbage

    // Pad to 5 cells so partial rows (no name/group/signal) still parse.
    while (cells.length < 5) cells.push('');

    const sigId = (cells[1] ?? '').trim().toUpperCase();
    if (!SIG_ID_RE.test(sigId)) continue;

    const name = blankToNull(cells[2]);
    const groupName = blankToNull(cells[3]);
    const signal = blankToNull(cells[4]);

    out.push({ sigId, name, groupName, signal });
  }

  return out;
}

function blankToNull(cell: string | undefined): string | null {
  const trimmed = (cell ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
}
