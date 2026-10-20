import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING } from '../vehicle/vehiclePose'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, poseAbove } from './scriptedSession'

// The #316 width bench as a spec (G&V amendment 2 on #308, ticket 620's acceptance): a planet-1
// level run of 30 m with `s` side cells a side opens a mean of 2 + s cells a metre, within 0.25,
// over 12 start phases a twelfth of a metre apart, and no two neighbouring metres of one run
// differ by more than one cell (an edge alternating by two reads as broken gear). The cut is the
// shipped swept cut (`drillStep`) on `benchDrillStep`'s line, with a drill whose work outruns the
// body, so the count is the stamp's and the gear's geometry, not the drill's pace. 2 to 5 cells a metre is today's content
// range, never a cap.

const RUN_METRES = 30
const PHASES = 12
const MM_PER_METRE = 1000
/** About 279.5 m from the centre on planet 1, the #316 bench's line, east of the dock. */
const START = { x: -10_000, y: 279_500 }
/** Breaks band-1 ground in about 4 ticks (stored step 200), so the cut keeps up with the body. */
const DRILL = { upgradeId: 'drill_power', level: 12 }
/** A tenth of a metre a tick (6 m/s): the drill's work outruns the body, so every cell clears. */
const STRIDE_MM = 100
/** Twelve 30 m runs at one width take about 5 s on an idle box. */
const RUN_TIMEOUT_MS = 120_000
/** The metres the stamp enters and leaves the run on, left out of the count. */
const EDGE_METRES = 2

/** A spec-only drill-gear source: `sideCells` cells on each side of the bore. */
function sideCellsSlice(sideCells: number): SliceDefinition {
  return {
    id: 'width-probe',
    register: (r) => r.drillGear({ id: 'width-probe.sides', gearOf: () => ({ sideCells }) }),
  }
}

/** The tiles a level run from `START.x + offsetMm` opened, as their column and row. */
function openedOnLevelRun(sideCells: number, offsetMm: number): DomainEvent[] {
  return withRegistrations([sideCellsSlice(sideCells)], () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setUpgrade', payload: DRILL })
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
    const x0 = START.x + offsetMm
    session.submit(0, { type: 'reportPose', payload: { ...payload, x: x0, y: START.y } })
    const events: DomainEvent[] = []
    const ticks = Math.ceil((RUN_METRES * MM_PER_METRE) / STRIDE_MM)
    for (let tick = 1; tick <= ticks; tick++) {
      session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '1000000' } })
      const step = { x: x0 + STRIDE_MM * tick, y: START.y, facing: FACING.right, drive: NO_DRIVE }
      events.push(...session.submit(tick, { type: 'drillStep', payload: step }))
    }
    return events
  })
}

/** Cells opened in each whole metre of the run's middle, by column. */
function cellsPerMetreOf(events: readonly DomainEvent[]): number[] {
  const firstColumn = Math.floor(START.x / MM_PER_METRE) + EDGE_METRES
  const counts = Array.from({ length: RUN_METRES - 2 * EDGE_METRES }, () => 0)
  for (const event of events) {
    if (event.type !== 'TileDestroyed') continue
    const metre = event.tx - firstColumn
    if (metre >= 0 && metre < counts.length) counts[metre] += 1
  }
  return counts
}

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function largestNeighbourGapOf(counts: readonly number[]): number {
  return Math.max(0, ...counts.slice(1).map((count, index) => Math.abs(count - counts[index])))
}

const phaseOffsetsMm = Array.from({ length: PHASES }, (_, phase) =>
  Math.round((phase * MM_PER_METRE) / PHASES),
)

describe('side cells per metre (#316 bench, ticket 620)', () => {
  it.each([0, 1, 2, 3])(
    'opens 2 + %i cells a metre within 0.25 over 12 start phases, neighbours at most 1 apart',
    (sideCells) => {
      const runs = phaseOffsetsMm.map((offsetMm) =>
        cellsPerMetreOf(openedOnLevelRun(sideCells, offsetMm)),
      )
      const mean = meanOf(runs.map(meanOf))
      expect(Math.abs(mean - (2 + sideCells))).toBeLessThanOrEqual(0.25)
      expect(Math.max(...runs.map(largestNeighbourGapOf))).toBeLessThanOrEqual(1)
    },
    RUN_TIMEOUT_MS,
  )
})
