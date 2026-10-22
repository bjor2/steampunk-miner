/**
 * The gnaw-collapse rows in the balance and session reports (#223 `reportRows`; Systems ruling (C)
 * on #676, the Scalers' done-when): per planet, how many collapses came after a wrecker gnaw and how
 * many with none, and how often a collapse after a gnaw hit a vehicle. The Tester reads them to
 * check that gnaws still cause some collapses on P5-P10 that hit the bare rig, and to judge the
 * lining's margin on the collapses that aren't gnaw-driven. Read off `ring_gnawed` and `collapse`
 * lines, never written into the log.
 *
 * A collapse is after a gnaw when its block lies beside a ring gnawed earlier on the planet and
 * no collapse has refilled that block since: a gnawed ring's walls can weaken the block they sit in
 * or the one whose air they border.
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { casingRingAround } from '../../systems/world/casingLining'
import { blockContaining, blockIdOf } from '../../systems/world/collapseBlock'
import { MM_PER_SAMPLE } from '../../systems/world/sampleGrid'

export const GNAW_COLLAPSE_REPORT_ROWS_ID = 'terrain-tools.gnaw-collapses'

export const gnawCollapseReportRows: ReportRowSource = {
  id: GNAW_COLLAPSE_REPORT_ROWS_ID,
  rowsOf: gnawCollapseRowsOf,
}

interface CollapseTally {
  afterGnaw: number
  withNoGnaw: number
  hitsAfterGnaw: number
}

function gnawCollapseRowsOf(
  events: readonly RunEvent[],
  _worldSeed: number,
  planet: number,
): ReportRow[] {
  const tally = tallyCollapses(events.filter((event) => event.planet === planet))
  return [
    { label: 'collapses after a gnaw', value: String(tally.afterGnaw) },
    { label: 'collapses with no gnaw', value: String(tally.withNoGnaw) },
    { label: 'vehicle hits by collapses after a gnaw', value: String(tally.hitsAfterGnaw) },
  ]
}

function tallyCollapses(events: readonly RunEvent[]): CollapseTally {
  const gnawedBlocks = new Set<string>()
  const tally: CollapseTally = { afterGnaw: 0, withNoGnaw: 0, hitsAfterGnaw: 0 }
  for (const event of events) {
    if (isRingGnawed(event)) blocksBesideRing(event.data.ring).forEach((id) => gnawedBlocks.add(id))
    if (isCollapse(event)) countCollapse(tally, gnawedBlocks, event)
  }
  return tally
}

/** Counts one collapse; its refill clears the block's breached lining, so the gnaw is spent. */
function countCollapse(
  tally: CollapseTally,
  gnawedBlocks: Set<string>,
  event: RunEvent<'collapse'>,
): void {
  const { block, vehiclesHit } = event.data
  if (!gnawedBlocks.delete(block)) {
    tally.withNoGnaw += 1
    return
  }
  tally.afterGnaw += 1
  tally.hitsAfterGnaw += vehiclesHit
}

/**
 * Every block a ring's walls sit in or border: the blocks holding the corners of the ring's square
 * grown by one sample. The square is under 3 m across and a block 4 m, so its corners reach every
 * block it overlaps.
 */
function blocksBesideRing(ring: string): string[] {
  const [xMm, yMm] = ring.split(',').map((part) => Number.parseInt(part, 10))
  const { clearMm, widthMm } = casingRingAround(xMm, yMm)
  const reach = clearMm + widthMm + MM_PER_SAMPLE
  const corners = [-reach, reach].flatMap((dx) =>
    [-reach, reach].map((dy) => blockIdOf(blockContaining({ xMm: xMm + dx, yMm: yMm + dy }))),
  )
  return [...new Set(corners)]
}

function isRingGnawed(event: RunEvent): event is RunEvent<'ring_gnawed'> {
  return event.event === 'ring_gnawed'
}

function isCollapse(event: RunEvent): event is RunEvent<'collapse'> {
  return event.event === 'collapse'
}
