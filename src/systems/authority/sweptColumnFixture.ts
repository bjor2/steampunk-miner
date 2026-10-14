/**
 * Planet 1's column 30 swept straight down by the 1.9 m stamp at a chosen stride, cut at the world
 * seam by a drill that clears every swept sample in its tick (the #304 law), so the same path
 * opens the same cells whatever the stride (ticket 335) and the world it leaves can be compared
 * across drill speeds (#401 VS2, the chunk diff size). Only specs use it.
 */
import { DRILL_STAMP_AHEAD_MM, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { CLOSED_CUT_GATE } from '../vehicle/cutGate'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import { pointAtStep, sweepPathOf, sweptStampOf, type SweptCut } from '../vehicle/sweptCut'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import { carveDisc, walkStampInRows } from '../world/groundEdit'
import type { StampPoint } from '../world/stampShape'
import { stampCellsUpTo, walkStampPerChunk } from '../world/sweptSpan'
import { EMPTY_WORLD, type WorldState } from '../world/worldState'
import { DRILL_CELLS_PER_TICK } from './cutShare'
import { PARAMS, poseAbove } from './scriptedSession'

export interface SweptColumn {
  world: WorldState
  /** The opened cells as `tx,ty`, sorted. */
  opened: string[]
}

const TOP = { x: 30_500, y: 261_500 }

/** The column swept `pathMetres` down from about 40 tiles under the surface, `strideMm` a tick. */
export function sweptColumnAt(strideMm: number, pathMetres: number): SweptColumn {
  // The stamp leads the pose by the fastest step's bound, so every stride sweeps the same path.
  const aheadMm = DRILL_STAMP_AHEAD_MM + 16_000
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  let world: WorldState = EMPTY_WORLD
  let cursor: SweptCut | undefined
  const opened: string[] = []
  const ticks = Math.ceil((pathMetres * 1000) / strideMm)
  for (let tick = 1; tick <= ticks + 1; tick++) {
    const y = TOP.y - Math.min((tick - 1) * strideMm, pathMetres * 1000)
    const pose: VehiclePose = { ...payload, x: TOP.x, y, facing: FACING.down }
    const stamp = sweptDrillStampOf(pose, false, aheadMm)
    const path = sweepPathOf(cursor, pose, { stamp, aheadMm }, tick)
    const disc = sweptStampOf(path, stamp, path.steps)
    const isPerCell = stampCellsUpTo(disc, new Set(), DRILL_CELLS_PER_TICK) <= DRILL_CELLS_PER_TICK
    const window = { firstTick: tick - 1, ticks: 1, subStepsPerTick: DRILL_SUBSTEPS_PER_TICK }
    const walk = isPerCell ? walkStampInRows : walkStampPerChunk
    const carve = carveDisc(world, PARAMS, disc, window, () => 1, walk)
    world = carve.world
    opened.push(...carve.yielded.map(({ tile }) => `${tile.tx},${tile.ty}`))
    cursor = cursorAt(pointAtStep(path, path.steps), pose, tick)
  }
  return { world, opened: opened.sort() }
}

function cursorAt(reached: StampPoint, pose: VehiclePose, tick: number): SweptCut {
  const step = { poseXMm: pose.x, poseYMm: pose.y, facing: pose.facing, tick }
  return { ...reached, ...step, ...CLOSED_CUT_GATE, cutSharePassed: 0, digSubSteps: 0 }
}
