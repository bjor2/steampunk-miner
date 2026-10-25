/**
 * The drill law's step for a tick that crosses more than one cell (ticket 733, the #439 work
 * ratchet at 3600 m/s), pure and integer.
 *
 * The law steps a front `floor(1000 * Q / nLead)` mm a tick through the slowest uncut cell of its
 * leading slab (`cutSpeed.ts`, ticket 570): exact while a tick crosses at most a cell, as the slab
 * holds the cells it cuts. A faster rig's tick crosses many cells the slab never read, and priced
 * every one at the slab's slowest: one hard cell 40 m ahead held a 3600 m/s front to 40 m where its
 * work paid 54, and the carry walk (`carryWalk.ts`) stopped at the stamp with a quarter of the
 * tick unspent. Past a cell a tick, the step is walked instead along the front's line in
 * `SWEEP_STEP_MM` sub-steps, each paying its own cell's drill time for the mm it crosses, as the
 * front's walk prices a cell for the length of its line inside it (`cellChord.ts`): through cells
 * alike it is the law's step again. The walk reads cells only until its work runs out.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { StampPoint } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { SWEEP_STEP_MM } from './sweptCut'
import { tileOfMillimetres, type IntegerVector } from './vehiclePose'

/** A front's line: where it starts, its aim (1024-scaled) and how far a tick may take it, mm. */
export interface FrontLine {
  from: StampPoint
  aim: IntegerVector
  limitMm: number
}

/** The law's step through the slab's lead cells, while it crosses at most a cell a tick. */
export function isWithinOneCell(leadStepMm: number): boolean {
  return leadStepMm <= MM_PER_METRE
}

/**
 * How far `quantum` sub-steps of work take a front along its line, mm: each sub-step pays the
 * drill time a metre of the cell it ends in (`timeAt`, 0 for open ground) for the mm it crosses,
 * and the first it cannot pay in full takes the front as far into it as the rest pays. Work is
 * counted in sub-step mm, so no rounding enters before that last floor.
 */
export function stepPaidAlongMm(
  line: FrontLine,
  timeAt: (tile: TilePoint) => number,
  quantum: number,
): number {
  let workLeft = quantum * MM_PER_METRE
  for (let startMm = 0; startMm < line.limitMm; startMm += SWEEP_STEP_MM) {
    const lengthMm = Math.min(SWEEP_STEP_MM, line.limitMm - startMm)
    const time = timeAt(tileAlong(line, startMm + lengthMm))
    if (time * lengthMm > workLeft) return startMm + Math.floor(workLeft / time)
    workLeft -= time * lengthMm
  }
  return line.limitMm
}

/** The cell `alongMm` down the line from its start. */
function tileAlong({ from, aim }: FrontLine, alongMm: number): TilePoint {
  const xMm = from.xMm + Math.floor((aim.x * alongMm) / UP_VECTOR_SCALE)
  const yMm = from.yMm + Math.floor((aim.y * alongMm) / UP_VECTOR_SCALE)
  return tileOfMillimetres(xMm, yMm)
}
