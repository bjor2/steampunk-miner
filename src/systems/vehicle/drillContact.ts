/**
 * What the drill meets (decision #7, on the #36 ground): ground its stamp can still cut, either in
 * the body's way (just past its face, across its width) or further ahead in the stamp's full-weight
 * core. The drill bites on either; only ground in the way holds the body back. Only samples the
 * stamp can still lower count, so pushing along the vehicle's own tunnel never drills (and drains
 * nothing), and nothing seen here is ground the drill may not cut: a wall, a floor below or the
 * lip of a shaft's round bottom.
 */
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { ISO_DENSITY, MM_PER_SAMPLE, SAMPLES_PER_TILE } from '../world/sampleGrid'
import {
  FULL_WEIGHT,
  discSamplesOf,
  type DiscStamp,
  type WeightedSample,
} from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import type { IntegerVector } from './vehiclePose'

const HALF_BODY_MM = (VEHICLE_COLLIDER_SIZE * 1000) / 2
/** How far past the face ground counts as in the way, mm. Placeholder, tuned by hand. */
const IN_THE_WAY_MM = 250

/** Nothing to cut, ground to cut ahead of the body, or ground in its way. */
export type DrillContact = 'none' | 'ahead' | 'inTheWay'

export interface DrillableGround {
  densityAt(sx: number, sy: number): number
  materialAt(tile: TilePoint): number
}

/** The body's centre in mm, its drill facing at the 1024 scale, and the stamp it would cut. */
export interface DrillAim {
  centreMm: IntegerVector
  facing: IntegerVector
  stamp: DiscStamp
}

export function drillContactOf(ground: DrillableGround, aim: DrillAim): DrillContact {
  let contact: DrillContact = 'none'
  for (const sample of discSamplesOf(aim.stamp)) {
    if (!isCuttable(ground, sample)) continue
    const place = placeOf(aim, sample)
    if (place === 'inTheWay') return place
    if (place === 'ahead') contact = place
  }
  return contact
}

function isCuttable(ground: DrillableGround, sample: WeightedSample): boolean {
  const density = ground.densityAt(sample.sx, sample.sy)
  if (density < ISO_DENSITY || density <= sample.floor || sample.weight === 0) return false
  const tile = {
    tx: Math.floor(sample.sx / SAMPLES_PER_TILE),
    ty: Math.floor(sample.sy / SAMPLES_PER_TILE),
  }
  return kindOfCell(ground.materialAt(tile)) !== CELL_KIND.indestructible
}

/** Within reach of the face across the body, else in the stamp's core ahead of the centre. */
function placeOf(aim: DrillAim, sample: WeightedSample): DrillContact {
  const scale = Math.sqrt(aim.facing.x * aim.facing.x + aim.facing.y * aim.facing.y)
  const dx = sample.sx * MM_PER_SAMPLE - aim.centreMm.x
  const dy = sample.sy * MM_PER_SAMPLE - aim.centreMm.y
  const ahead = (dx * aim.facing.x + dy * aim.facing.y) / scale
  const across = (dy * aim.facing.x - dx * aim.facing.y) / scale
  const isPastFace = ahead >= HALF_BODY_MM && ahead <= HALF_BODY_MM + IN_THE_WAY_MM
  if (isPastFace && Math.abs(across) <= HALF_BODY_MM) return 'inTheWay'
  return sample.weight === FULL_WEIGHT && ahead > 0 ? 'ahead' : 'none'
}
