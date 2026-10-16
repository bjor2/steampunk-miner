/**
 * What the drill meets (decision #7, on the #36 ground): ground its stamp can still cut, either in
 * the body's way (just past its face, across its width) or further ahead in the stamp's full-weight
 * core. The drill bites on either; only ground in the way holds the body back. Only samples the
 * stamp can still lower count, so pushing along the vehicle's own tunnel never drills (and drains
 * nothing), and nothing seen here is ground the drill may not cut: a wall, a floor below or the
 * lip of a shaft's round bottom. The dock pad and lava (#113) are never cut.
 *
 * With the swept cut on (ticket 330) the body reaches part-cut ground sooner, and a lip it rests on
 * can sit past the face's reach and outside the stamp's full-weight core: the drill would stop and
 * the body would stay on it. `sweptDrillContactOf` therefore also bites on any ground the stamp can
 * still cut past the body's face. The authority charges only the ticks that removed something.
 *
 * With the swept cut off the same lip dead-stops a level leg (ticket 516, the TD's #441 measure):
 * the body rests on it and the drill does not bite. `levelSliverDrillContactOf` takes the swept
 * rule's bite on a level cut only, so a cut down or up drills exactly as before.
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

/** Half the body's box, mm: its face this far ahead of the centre, its wheel line as far below. */
export const HALF_BODY_MM = (VEHICLE_COLLIDER_SIZE * 1000) / 2
/**
 * How far past the face ground counts as in the way, mm. Placeholder, tuned by hand; with the
 * swept cut it widens to the step the rig may take while it cuts (`inTheWayMmOf`, ticket 334).
 */
const IN_THE_WAY_MM = 250

/** Nothing to cut, ground to cut ahead of the body, or ground in its way. */
export type DrillContact = 'none' | 'ahead' | 'inTheWay'

/** A rule for what the drill meets: `drillContactOf`, or a wider bite (swept, level sliver). */
export type DrillContactRule = (ground: DrillableGround, aim: DrillAim) => DrillContact

export interface DrillableGround {
  densityAt(sx: number, sy: number): number
  materialAt(tile: TilePoint): number
}

/** The body's centre in mm, its drill facing at the 1024 scale, and the stamp it would cut. */
export interface DrillAim {
  centreMm: IntegerVector
  facing: IntegerVector
  stamp: DiscStamp
  /** How far past the face ground is in the way, mm; `IN_THE_WAY_MM` when absent. */
  inTheWayMm?: number
}

/**
 * The in-the-way window for a rig whose cutting step bound is `cuttingBoundMm` (TD scope a on #316,
 * ticket 334): at least one tick's step, so the wheels wait on the cut instead of a contact
 * absorbing a step that overshoots the window into rock.
 */
export function inTheWayMmOf(cuttingBoundMm: number): number {
  return Math.max(IN_THE_WAY_MM, cuttingBoundMm)
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

/** `drillContactOf`, also biting on any ground the stamp can cut past the face (ticket 330). */
export function sweptDrillContactOf(ground: DrillableGround, aim: DrillAim): DrillContact {
  const contact = drillContactOf(ground, aim)
  if (contact !== 'none') return contact
  const isBiting = (sample: WeightedSample) =>
    isCuttable(ground, sample) && aheadOf(aim, sample) >= HALF_BODY_MM
  return discSamplesOf(aim.stamp).some(isBiting) ? 'ahead' : 'none'
}

/** `drillContactOf`, with the swept cut's bite past the face on a level cut (ticket 516). */
export function levelSliverDrillContactOf(ground: DrillableGround, aim: DrillAim): DrillContact {
  return isLevelCut(aim.stamp) ? sweptDrillContactOf(ground, aim) : drillContactOf(ground, aim)
}

/** A level cut's stamp keeps a level floor at the wheels (`drillStamp.ts`). */
function isLevelCut(stamp: DiscStamp): boolean {
  return stamp.floorRadiusMm !== null
}

/** Ground the stamp can still lower at this sample: solid, above its floor, never a wall or lava. */
export function isCuttable(ground: DrillableGround, sample: WeightedSample): boolean {
  const density = ground.densityAt(sample.sx, sample.sy)
  if (density < ISO_DENSITY || density <= sample.floor || sample.weight === 0) return false
  const tile = {
    tx: Math.floor(sample.sx / SAMPLES_PER_TILE),
    ty: Math.floor(sample.sy / SAMPLES_PER_TILE),
  }
  const kind = kindOfCell(ground.materialAt(tile))
  return kind !== CELL_KIND.indestructible && kind !== CELL_KIND.lava
}

/** Within reach of the face across the body, else in the stamp's core ahead of the centre. */
function placeOf(aim: DrillAim, sample: WeightedSample): DrillContact {
  const ahead = aheadOf(aim, sample)
  const across = acrossOf(aim, sample)
  const isPastFace =
    ahead >= HALF_BODY_MM && ahead <= HALF_BODY_MM + (aim.inTheWayMm ?? IN_THE_WAY_MM)
  if (isPastFace && Math.abs(across) <= HALF_BODY_MM) return 'inTheWay'
  return sample.weight === FULL_WEIGHT && ahead > 0 ? 'ahead' : 'none'
}

/** mm from the body's centre to the sample along the facing. */
export function aheadOf(aim: DrillAim, sample: WeightedSample): number {
  const { dx, dy, scale } = offsetOf(aim, sample)
  return (dx * aim.facing.x + dy * aim.facing.y) / scale
}

/** mm from the body's centre to the sample across the facing. */
export function acrossOf(aim: DrillAim, sample: WeightedSample): number {
  const { dx, dy, scale } = offsetOf(aim, sample)
  return (dy * aim.facing.x - dx * aim.facing.y) / scale
}

function offsetOf(aim: DrillAim, sample: WeightedSample) {
  return {
    dx: sample.sx * MM_PER_SAMPLE - aim.centreMm.x,
    dy: sample.sy * MM_PER_SAMPLE - aim.centreMm.y,
    scale: Math.sqrt(aim.facing.x * aim.facing.x + aim.facing.y * aim.facing.y),
  }
}
