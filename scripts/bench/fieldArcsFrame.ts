/**
 * The magnetic field lines' slice bench (GD ruling on #293 Q1, the measured raise of #213's
 * `SCENE_LAYER_LINE` from 1024 to 1088): the frame cost the `planet-mix.field-lines` layer adds on
 * P43 at the 16 m/s top speed, before and after, timed by the slice (`timeFieldArcFrames`, reached
 * through its debug action as `ore:mix` reaches the mix). Pass is a p95 change of 0.1 ms or less
 * and no reallocation of the arc buffer; the GPU's draw of the lines is not in it. Measured and
 * printed, not gated in CI; record the line on #213.
 */
import { debugActionsBySlice } from '../../src/debug/debugActionRegistry'
import type { BenchmarkSeries } from '../../src/logging/benchmarkResult'

const BUDGET_P95_CHANGE_MS = 0.1

interface FieldArcFrameAnswer {
  ok: boolean
  planetIndex: number
  before: number[]
  after: number[]
  picks: number[]
  arcs: number
  bufferReallocations: number
  problems?: string[]
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

const round = (ms: number) => Number(ms.toFixed(4))

function timeFrames(worldSeed: number): FieldArcFrameAnswer {
  const timeFieldArcFrames = debugActionsBySlice()['planet-mix']?.timeFieldArcFrames
  if (timeFieldArcFrames === undefined) throw new Error('the planet-mix slice is not loaded')
  const answer = timeFieldArcFrames(worldSeed, () => performance.now()) as FieldArcFrameAnswer
  if (!answer.ok) throw new Error(answer.problems?.join('\n'))
  return answer
}

/** Both series: `fieldArcsFrame.before` and `fieldArcsFrame.after`. */
export function benchFieldArcsFrame(worldSeed: number): BenchmarkSeries[] {
  const times = timeFrames(worldSeed)
  const changeP95Ms = percentile(times.after, 0.95) - percentile(times.before, 0.95)
  console.log(
    JSON.stringify({
      bench: 'fieldArcsFrame',
      planetIndex: times.planetIndex,
      frames: times.after.length,
      picks: times.picks.length,
      lastArcs: times.arcs,
      beforeP95Ms: round(percentile(times.before, 0.95)),
      afterP50Ms: round(percentile(times.after, 0.5)),
      afterP95Ms: round(percentile(times.after, 0.95)),
      afterMaxMs: round(Math.max(...times.after)),
      pickP95Ms: round(percentile(times.picks, 0.95)),
      changeP95Ms: round(changeP95Ms),
      budgetP95ChangeMs: BUDGET_P95_CHANGE_MS,
      bufferReallocations: times.bufferReallocations,
      isWithinBudget: changeP95Ms <= BUDGET_P95_CHANGE_MS && times.bufferReallocations === 0,
    }),
  )
  return [
    { name: 'fieldArcsFrame.before', planet: times.planetIndex, timesMs: times.before },
    { name: 'fieldArcsFrame.after', planet: times.planetIndex, timesMs: times.after },
  ]
}
