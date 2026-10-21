/**
 * The collapse-death row in the balance and session reports (#223 `reportRows`; Systems ruling on
 * #664, done-when 3): per planet, how many times a collapse destroyed the rig, read off the run's
 * `vehicle_destroyed` lines and never written into the log. The Tester reads the bare rig's rate
 * across the pacing seeds: a bare on-curve rig dying on most P7 seeds is a difficulty-curve
 * finding of its own, which stabiliser foam's pace gate no longer absorbs (`foamPaceGate.ts`).
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'

export const COLLAPSE_DEATH_REPORT_ROWS_ID = 'terrain-tools.collapse-deaths'

export const collapseDeathReportRows: ReportRowSource = {
  id: COLLAPSE_DEATH_REPORT_ROWS_ID,
  rowsOf: collapseDeathRowsOf,
}

function collapseDeathRowsOf(
  events: readonly RunEvent[],
  _worldSeed: number,
  planet: number,
): ReportRow[] {
  const deaths = events.filter((event) => event.planet === planet && isCollapseDeath(event))
  return [{ label: 'rig destroyed by a collapse', value: String(deaths.length) }]
}

function isCollapseDeath(event: RunEvent): boolean {
  return isRigDestroyed(event) && event.data.cause === 'collapse'
}

function isRigDestroyed(event: RunEvent): event is RunEvent<'vehicle_destroyed'> {
  return event.event === 'vehicle_destroyed'
}
