import { describe, expect, it } from 'vitest';
import { parseSignaturePaste } from '@/lib/map/signatureParser';

/**
 * Pure parser tests for the EVE probe-scanner clipboard format.
 *
 * Format (current EVE client): five tab-separated columns in fixed order
 *   `Distance, ID, Name, Group, Signal`
 * Distance is parsed for row acceptance but discarded from the output type.
 * The probe scanner never emits a wormhole-type code (A239, K162, etc.) in the
 * paste, so the parser doesn't try to extract one.
 */

describe('parseSignaturePaste', () => {
  it('parses a standard 5-column tab-separated dump', () => {
    const text = [
      '1.23 AU\tABC-123\tUnstable Wormhole\tWormhole\t100.0%',
      '2.41 AU\tGHI-789\tForgotten Frontier\tCosmic Anomaly\t100.0%',
    ].join('\n');

    expect(parseSignaturePaste(text)).toEqual([
      {
        sigId: 'ABC-123',
        name: 'Unstable Wormhole',
        groupName: 'Wormhole',
        signal: '100.0%',
      },
      {
        sigId: 'GHI-789',
        name: 'Forgotten Frontier',
        groupName: 'Cosmic Anomaly',
        signal: '100.0%',
      },
    ]);
  });

  it('accepts multi-space-separated rows (clipboards that strip tabs)', () => {
    const text =
      '1.23 AU    ABC-123    Unstable Wormhole    Wormhole          100.0%';
    expect(parseSignaturePaste(text)).toEqual([
      {
        sigId: 'ABC-123',
        name: 'Unstable Wormhole',
        groupName: 'Wormhole',
        signal: '100.0%',
      },
    ]);
  });

  it('skips header rows, blank lines, and garbage', () => {
    const text = [
      'Distance\tID\tName\tGroup\tSignal',
      '',
      '',
      'not a real row',
      '1.23 AU\tABC-123\tUnstable Wormhole\tWormhole\t100.0%',
    ].join('\n');

    expect(parseSignaturePaste(text)).toHaveLength(1);
  });

  it('returns null name/groupName for barely-detected partial scans', () => {
    const text = '-\tJKL-012\t\t\t4.2%';
    expect(parseSignaturePaste(text)).toEqual([
      { sigId: 'JKL-012', name: null, groupName: null, signal: '4.2%' },
    ]);
  });

  it('accepts a leading "-" distance for unresolved rows', () => {
    const text = '-\tDEF-456\tUnstable Wormhole\tWormhole\t100.0%';
    expect(parseSignaturePaste(text)).toHaveLength(1);
  });

  it('uppercases sig ids and skips rows whose id does not match AAA-NNN', () => {
    const text = [
      '1.23 AU\tabc-123\tUnstable Wormhole\tWormhole\t100.0%',
      '1.23 AU\tNOTASIGID\tUnstable Wormhole\tWormhole\t100.0%',
      '1.23 AU\tAB-1234\tUnstable Wormhole\tWormhole\t100.0%',
    ].join('\n');

    const rows = parseSignaturePaste(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sigId).toBe('ABC-123');
  });

  it('returns [] on empty or non-string input', () => {
    expect(parseSignaturePaste('')).toEqual([]);
    expect(parseSignaturePaste('\n\n\n')).toEqual([]);
  });

  it('tolerates trailing whitespace and CRLF line endings', () => {
    const text = '1.23 AU\tABC-123\tUnstable Wormhole\tWormhole\t100.0%   \r\n';
    expect(parseSignaturePaste(text)).toEqual([
      {
        sigId: 'ABC-123',
        name: 'Unstable Wormhole',
        groupName: 'Wormhole',
        signal: '100.0%',
      },
    ]);
  });
});
