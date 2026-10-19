/**
 * The swept cut's energy at any speed (ticket 335, the TD lock on #374 with the Vertical Scaler):
 * charged exactly per cell, never from a tick count or from the tick's summed dig time, so energy
 * per cell is the same at 1, 4 and 16 m a tick.
 *
 * - A cell the cut breaks costs the drill's own dig energy for it, the energy a drill running for
 *   that cell's drill time burns (`drill ticks x drill quanta`, as the bore gun prices a cell,
 *   `bore/boreCell.ts`), so it is weighted by the cell's own hardness: a change of band, ore or
 *   depth inside a span is priced per cell, never at the span's first or average cell. Drill time is
 *   in sub-steps (#330's rational drill time) of the rig's drill quantum (ticket 558), rounded up
 *   once per cell to a whole energy quantum.
 * - A drill-gear cell costs that at the gear's energy share (`drillGearCaps.ts`), as a tick of gear
 *   cutting does.
 * - Lining the cut cleared is priced as the cells its samples make up, at the lining's hardness.
 * - Never more than the tank holds: the tick that empties it is the last that cuts (#7, the drill
 *   charges no more than the tank pays for).
 *
 * Heat is the other half of the same lock: it comes from the steps' summed dig time
 * (`sweptCut.ts`, `stepDigTicksOf`), so overheat never becomes a hidden speed cap.
 */
import { BASIS_POINTS, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { CellDrillTicks } from '../world/groundEdit'
import { SAMPLES_PER_CELL } from '../world/sampleGrid'
import type { DrillCarve } from './drillGearCut'

/**
 * A drill running `subSteps` sub-steps of `quantum` a tick burns this many quanta, at `shareBp` of
 * the drill's rate.
 */
export function cellDigEnergyOf(
  subSteps: number,
  shareBp: number = BASIS_POINTS,
  quantum: number = DRILL_SUBSTEPS_PER_TICK,
): number {
  const scaled = subSteps * ENERGY_QUANTA_PER_TICK.drill * shareBp
  return Math.ceil(scaled / (quantum * BASIS_POINTS))
}

/** What a swept carve costs from a tank of `tank` quanta, with cell times in sub-steps of `quantum`. */
export function sweptCutEnergyOf(
  carved: DrillCarve,
  cellTimes: CellDrillTicks,
  tank: number,
  quantum: number = DRILL_SUBSTEPS_PER_TICK,
): number {
  const timed = { cellTimes, quantum }
  return Math.min(tank, brokenCellsEnergyOf(carved, timed) + liningEnergyOf(carved, timed))
}

/** Cell times in sub-steps, and the sub-steps a tick they count in. */
interface CellTimesIn {
  cellTimes: CellDrillTicks
  quantum: number
}

function brokenCellsEnergyOf(carved: DrillCarve, { cellTimes, quantum }: CellTimesIn): number {
  const shareOf = gearShareLookupOf(carved)
  return carved.yielded.reduce((sum, { tile, cell }) => {
    const subSteps = cellTimes(tile, cell, 0) ?? 0
    return sum + cellDigEnergyOf(subSteps, shareOf(`${tile.tx},${tile.ty}`), quantum)
  }, 0)
}

/** A gear cell's energy share, else the drill's whole share. */
function gearShareLookupOf(carved: DrillCarve): (key: string) => number {
  const shares = new Map(carved.gearCells.map(({ tx, ty, shareBp }) => [`${tx},${ty}`, shareBp]))
  return (key) => shares.get(key) ?? BASIS_POINTS
}

/** The lining samples the cut cleared, priced as the cells they make up at the lining's grade. */
function liningEnergyOf(carved: DrillCarve, { cellTimes, quantum }: CellTimesIn): number {
  const { samples, grade } = carved.casingCleared
  if (samples === 0) return 0
  const subSteps = cellTimes({ tx: 0, ty: 0 }, 0, grade) ?? 0
  return Math.ceil((samples * cellDigEnergyOf(subSteps, BASIS_POINTS, quantum)) / SAMPLES_PER_CELL)
}
