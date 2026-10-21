/**
 * The debug reads behind the HUD coverage overlay (spec #678, ticket 682): switch the overlay on
 * or off, and read the coverage report the page measures now, whether the overlay shows or not,
 * so the screenshot suite (#689) judges the same numbers the overlay prints. Presentation only:
 * no command, no log line, nothing a save or the digest sees.
 */
import type { HudCoverageReport } from '../systems/views/hudCoverageReport'
import { showHudCoverage } from '../ui/debug/hudCoverageSwitch'
import { measureHudCoverage } from '../ui/debug/measureHudCoverage'
import type { DebugResult } from './debugScreens'

export function showHudCoverageUnlessRefused(shown: unknown): DebugResult {
  if (typeof shown !== 'boolean') return { ok: false, problems: ['shown must be true or false'] }
  showHudCoverage(shown)
  return { ok: true }
}

export function hudCoverageNow(): DebugResult<{ report: HudCoverageReport }> {
  const report = measureHudCoverage()
  if (report === null) return { ok: false, problems: ['no screen has been fitted yet'] }
  return { ok: true, report }
}
