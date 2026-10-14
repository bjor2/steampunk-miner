/**
 * The leading slab (TD scope 0 on #316, ticket 333): the stamp's full-weight samples ahead of the
 * body's face and within its width, the ground the next step drives into. Its uncut share opens
 * and closes the cut gate (`cutGate.ts`), and its uncut cells set the cut-follow's speed.
 *
 * A pure integer read of the densities, the cell kinds and the integer pose, the same measure as
 * the drill's contact (`drillContact.ts`), so the authority and a client reading the same world
 * get the same answer.
 */
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { FULL_WEIGHT, discSamplesOf, type WeightedSample } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { acrossOf, aheadOf, isCuttable, type DrillAim, type DrillableGround } from './drillContact'

const HALF_BODY_MM = (VEHICLE_COLLIDER_SIZE * 1000) / 2
const BASIS_POINTS = 10000

export interface LeadingSlab {
  /** The share of the slab's samples the stamp can still cut, in basis points; 0 when empty. */
  uncutBp: number
  /** The tiles of those uncut samples, each once, in sample order. */
  uncutTiles: TilePoint[]
}

export function leadingSlabOf(ground: DrillableGround, aim: DrillAim): LeadingSlab {
  const slab = discSamplesOf(aim.stamp).filter((sample) => isInSlab(aim, sample))
  const uncut = slab.filter((sample) => isCuttable(ground, sample))
  return { uncutBp: shareInBasisPoints(uncut.length, slab.length), uncutTiles: tilesOf(uncut) }
}

function isInSlab(aim: DrillAim, sample: WeightedSample): boolean {
  if (sample.weight !== FULL_WEIGHT) return false
  return aheadOf(aim, sample) >= HALF_BODY_MM && Math.abs(acrossOf(aim, sample)) <= HALF_BODY_MM
}

function shareInBasisPoints(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.floor((part * BASIS_POINTS) / whole)
}

function tilesOf(samples: readonly WeightedSample[]): TilePoint[] {
  const tiles = new Map<string, TilePoint>()
  for (const { sx, sy } of samples) {
    const tx = Math.floor(sx / SAMPLES_PER_TILE)
    const ty = Math.floor(sy / SAMPLES_PER_TILE)
    if (!tiles.has(`${tx},${ty}`)) tiles.set(`${tx},${ty}`, { tx, ty })
  }
  return [...tiles.values()]
}
