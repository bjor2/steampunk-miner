import { afterAll, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { cutSpeedSlab, slabRigOf, strideOfSpeed, type SlabRun } from './speedSlabFixtures'

// The tick-time bar of the speed-scaling slab (ticket 560, the TD's row on #551): a `drillStep`
// through the shipped path costs p50 3 ms or less a tick at 84 and 840 m/s, the bore 7 cells wide
// (the bare bore's 2 plus 5 side cells from a lane-only drill-gear source, as the TD's harness),
// on a warm chunk cache: one run first, untimed, then the timed ones. Only the ticks the rig moves
// on are timed (the descent to the column's foot, gate-free), so the rest at the foot does not
// pull the median down. A lane: it reads the wall clock, so it runs only when named and prints
// its table; 8400 m/s waits on #558's sub-step floor.

const BUDGET_P50_MS = 3
const RUNS: Readonly<Record<number, number>> = { 84: 3, 840: 20 }
const rows: string[] = []

afterAll(() => {
  console.log(['speed m/s | timed ticks | p50 ms | p95 ms | budget p50 ms', ...rows].join('\n'))
})

/** A lane-only drill-gear source: five side cells, a bore seven cells wide. */
const WIDTH_SEVEN: SliceDefinition = {
  id: 'lane-gear',
  register: (r) => r.drillGear({ id: 'lane-gear.sides', gearOf: () => ({ sideCells: 5 }) }),
}

const clock = () => performance.now()

/** The step times of the ticks a run moved on: up to the tick it reached the column's foot. */
function movingStepMsOf(run: SlabRun): number[] {
  return run.stepMs.slice(0, run.arrivedTick ?? run.stepMs.length)
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function timedStepsAt(speed: number): number[] {
  const rig = slabRigOf(strideOfSpeed(speed))
  return withRegistrations([WIDTH_SEVEN], () => {
    cutSpeedSlab(rig)
    const runs = Array.from({ length: RUNS[speed] }, () => cutSpeedSlab(rig, { clock }))
    return runs.flatMap(movingStepMsOf)
  })
}

describe('the speed-scaling slab tick time, width 7, warm cache (ticket 560)', () => {
  it.each([84, 840])('steps p50 within 3 ms a tick at %i m/s', (speed) => {
    const times = timedStepsAt(speed)
    const p50 = percentile(times, 0.5)
    rows.push(
      `${speed} | ${times.length} | ${p50.toFixed(3)} | ${percentile(times, 0.95).toFixed(3)} | ${BUDGET_P50_MS}`,
    )
    expect(p50).toBeLessThanOrEqual(BUDGET_P50_MS)
  })

  it.todo('steps p50 within 3 ms a tick at 8400 m/s once #558 lifts the sub-step floor')
})
