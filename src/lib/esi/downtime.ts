import { apertureConfig } from '../../../aperture.config';

/**
 * CCP daily-downtime window check.
 *
 * ESI is expected to fail around CCP's daily server restart. Failures inside
 * this window are not counted against the circuit breakers and are surfaced as
 * an expected `EsiDowntimeError` rather than a real fault. Mirrors the legacy
 * `Lib\Config::inDownTimeRange` (SPEC §01): the window is `CCP_SSO_DOWNTIME` ±
 * `CCP_SSO_DOWNTIME_WINDOW_MIN`, padded by `CCP_SSO_DOWNTIME_BUFFER_MIN` on each
 * side. All arithmetic is in UTC.
 */

/** True when `at` falls within CCP's padded daily-downtime window (UTC). */
export function inDowntimeWindow(at: Date = new Date()): boolean {
  const [hh, mm] = apertureConfig.CCP_SSO_DOWNTIME.split(':').map(Number);
  const startMin = hh! * 60 + mm!;
  const halfWidth =
    apertureConfig.CCP_SSO_DOWNTIME_WINDOW_MIN + apertureConfig.CCP_SSO_DOWNTIME_BUFFER_MIN;

  const nowMin = at.getUTCHours() * 60 + at.getUTCMinutes();
  // Circular minute-of-day distance so a window straddling midnight still works.
  const diff = Math.abs(nowMin - startMin);
  const circularDiff = Math.min(diff, 1440 - diff);
  return circularDiff <= halfWidth;
}
