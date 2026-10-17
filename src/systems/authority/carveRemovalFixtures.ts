/**
 * What a disc carve removed, sample by sample, for Step 0 of the carve-geometry ticket on #514's
 * track lane (TD ruling on #537, 6228947744 section 3): over the stamp's samples
 * (`discSamplesOf`), the removal the whole-tick formula attempted before its clamp (`groundEdit.ts`
 * `carveOneSample`, `min(density - floor, attempted)`), the removal it applied, and the continuum
 * the formula floors, `255 w Q k / (W n)` unrounded. Attempted against continuum is the rounding,
 * applied against attempted the clamp (ground already gone or the level floor).
 *
 * Read inside the carve's walk once it has run (`walkingWithRemoval`), so each sample's drill
 * time is the one the carve worked out (its session's cache, keyed as `drillTicksOfSample` keys
 * it) and no gate is asked twice. A rim-dwell window (the swept cut's) charges by dwell, not this
 * formula, so it is refused. Test support; it reads, never writes.
 */
import { effectiveCasingGrade } from '../world/chunkDelta'
import type { CarveWindow, StampWalk } from '../world/groundEdit'
import {
  casingGradeOf,
  densityOf,
  isCarvable,
  openSession,
  tileOfSample,
  type EditSession,
} from '../world/groundEditSession'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../world/sampleGrid'
import {
  FULL_WEIGHT,
  discSamplesOf,
  type DiscStamp,
  type WeightedSample,
} from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'

const SOLID_CELL_SUM = SAMPLES_PER_CELL * SOLID_DENSITY

/** Removal summed over samples, in full cells (a cell's 16 samples at full density). */
export interface CarveRemoval {
  attempted: number
  applied: number
  continuum: number
}

export const NO_CARVE_REMOVAL: CarveRemoval = { attempted: 0, applied: 0, continuum: 0 }

export function addCarveRemoval(a: CarveRemoval, b: CarveRemoval): CarveRemoval {
  return {
    attempted: a.attempted + b.attempted,
    applied: a.applied + b.applied,
    continuum: a.continuum + b.continuum,
  }
}

/** `walk`, then what it removed from the counted cells, handed to `record`. */
export function walkingWithRemoval(
  walk: StampWalk,
  isCounted: (tile: TilePoint) => boolean,
  record: (removal: CarveRemoval) => void,
): StampWalk {
  return (session, disc, window, drillTicksOf) => {
    const before = openSession(session.world, session.params)
    const ticks = walk(session, disc, window, drillTicksOf)
    record(walkedRemovalOf({ before, carved: session }, disc, window, isCounted))
    return ticks
  }
}

/** The ground before the walk, and the walk's session after it. */
interface WalkedGround {
  before: EditSession
  carved: EditSession
}

function walkedRemovalOf(
  ground: WalkedGround,
  disc: DiscStamp,
  window: CarveWindow,
  isCounted: (tile: TilePoint) => boolean,
): CarveRemoval {
  if (window.dwellAt !== undefined) throw new Error('a rim-dwell carve is not read by the formula')
  let removal = NO_CARVE_REMOVAL
  for (const sample of discSamplesOf(disc)) {
    if (!isCounted(tileOfSample(sample)) || !isCarvable(ground.before, sample)) continue
    const drillTicks = carvedDrillTicksOf(ground, sample)
    if (drillTicks === null) continue
    removal = addCarveRemoval(removal, sampleRemovalOf(ground, sample, window, drillTicks))
  }
  return removal
}

/** The drill time the carve cached for the sample's cell and casing grade; null if it cannot cut. */
function carvedDrillTicksOf(ground: WalkedGround, sample: WeightedSample): number | null {
  const tile = tileOfSample(sample)
  const grade = effectiveCasingGrade(casingGradeOf(ground.before, sample))
  return ground.carved.drillTicks.get(`${tile.tx},${tile.ty}#${grade}`) ?? null
}

function sampleRemovalOf(
  ground: WalkedGround,
  sample: WeightedSample,
  window: CarveWindow,
  drillTicks: number,
): CarveRemoval {
  const perTick = SOLID_DENSITY * sample.weight * (window.subStepsPerTick ?? 1)
  const per = FULL_WEIGHT * drillTicks
  const { firstTick, ticks } = window
  const attempted =
    Math.floor((perTick * (firstTick + ticks)) / per) - Math.floor((perTick * firstTick) / per)
  return {
    attempted: attempted / SOLID_CELL_SUM,
    applied: (densityOf(ground.before, sample) - densityOf(ground.carved, sample)) / SOLID_CELL_SUM,
    continuum: (perTick * ticks) / per / SOLID_CELL_SUM,
  }
}
