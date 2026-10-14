/**
 * The magnet fields' slice bench (GD and TD rulings on #286 Q1, the second measured raise of
 * #213's `SCENE_LAYER_LINE`, from 1088 to 1128): the frame cost the `terrain-tools.magnet-fields`
 * layer adds on P43 at the 16 m/s top speed with all three verbs live for three players, before
 * and after, timed by the slice (`timeMagnetFieldFrames`, reached through its debug action). It
 * runs in `npm run bench:render` right after `fieldArcsFrame`, the 63 field arcs on the same P43
 * descent. Pass is a p95 change of 0.1 ms or less and no reallocation of the buffer; the GPU's
 * draw of the lines is not in it. Measured and printed, not gated in CI; record the line on #213.
 * If it fails, the TD's fallback is the cap at 34, re-run before asking for another layer's share.
 */
import { debugActionsBySlice } from '../../src/debug/debugActionRegistry'
import type { BenchmarkSeries } from '../../src/logging/benchmarkResult'

const BUDGET_P95_CHANGE_MS = 0.1

interface MagnetFieldFrameAnswer {
  ok: boolean
  planetIndex: number
  before: number[]
  after: number[]
  rebuilds: number[]
  pieces: number
  bufferReallocations: number
  problems?: string[]
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

const round = (ms: number) => Number(ms.toFixed(4))

function timeFrames(worldSeed: number): MagnetFieldFrameAnswer {
  const timeMagnetFieldFrames = debugActionsBySlice()['terrain-tools']?.timeMagnetFieldFrames
  if (timeMagnetFieldFrames === undefined) throw new Error('the terrain-tools slice is not loaded')
  const answer = timeMagnetFieldFrames(worldSeed, () => performance.now()) as MagnetFieldFrameAnswer
  if (!answer.ok) throw new Error(answer.problems?.join('\n'))
  return answer
}

/** Both series: `magnetFieldsFrame.before` and `magnetFieldsFrame.after`. */
export function benchMagnetFieldsFrame(worldSeed: number): BenchmarkSeries[] {
  const times = timeFrames(worldSeed)
  const changeP95Ms = percentile(times.after, 0.95) - percentile(times.before, 0.95)
  console.log(
    JSON.stringify({
      bench: 'magnetFieldsFrame',
      planetIndex: times.planetIndex,
      frames: times.after.length,
      rebuilds: times.rebuilds.length,
      lastPieces: times.pieces,
      beforeP95Ms: round(percentile(times.before, 0.95)),
      afterP50Ms: round(percentile(times.after, 0.5)),
      afterP95Ms: round(percentile(times.after, 0.95)),
      afterMaxMs: round(Math.max(...times.after)),
      rebuildP95Ms: round(percentile(times.rebuilds, 0.95)),
      changeP95Ms: round(changeP95Ms),
      budgetP95ChangeMs: BUDGET_P95_CHANGE_MS,
      bufferReallocations: times.bufferReallocations,
      isWithinBudget: changeP95Ms <= BUDGET_P95_CHANGE_MS && times.bufferReallocations === 0,
    }),
  )
  return [
    { name: 'magnetFieldsFrame.before', planet: times.planetIndex, timesMs: times.before },
    { name: 'magnetFieldsFrame.after', planet: times.planetIndex, timesMs: times.after },
  ]
}
