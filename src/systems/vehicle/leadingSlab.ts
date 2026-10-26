/**
 * The leading slab (TD scope 0 on #316, ticket 333): the stamp's cleared core's samples ahead of the
 * body's face and within its width, the ground the next step drives into. Its uncut share opens
 * and closes the cut gate (`cutGate.ts`), and its uncut cells set the cut-follow's speed.
 *
 * A pure integer read of the densities, the cell kinds and the integer pose, the same measure as
 * the drill's contact (`drillContact.ts`), so the authority and a client reading the same world
 * get the same answer. The face and width are the aim's body's (ticket 750, `DrillAim.widthLevel`).
 */
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { discSamplesOf, isInClearedCore, type WeightedSample } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import {
  acrossOf,
  aheadOf,
  bodyHalfMmOfAim,
  isCuttable,
  type DrillAim,
  type DrillableGround,
} from './drillContact'

const BASIS_POINTS = 10000

export interface LeadingSlab {
  /** The share of the slab's samples the stamp can still cut, in basis points; 0 when empty. */
  uncutBp: number
  /** The tiles of those uncut samples, each once, in sample order. */
  uncutTiles: TilePoint[]
}

export function leadingSlabOf(ground: DrillableGround, aim: DrillAim): LeadingSlab {
  const halfMm = bodyHalfMmOfAim(aim)
  const slab = discSamplesOf(aim.stamp).filter((sample) => isInSlab(aim, sample, halfMm))
  const uncut = slab.filter((sample) => isCuttable(ground, sample))
  return { uncutBp: shareInBasisPoints(uncut.length, slab.length), uncutTiles: tilesOf(uncut) }
}

/**
 * A step's slab (ticket 662) from its front's disc and its whole reach, from the report's stamp at
 * the face to that disc: uncut by the more uncut of the two, its cells the front's, or the reach's
 * where the front has none. The 1.2 m bore's disc at a fast step's front starts most of a metre
 * past the face, so on rock with a cave past it the front alone read nothing to cut; while at an
 * up cut's start the travelling carve clears the near reach during the gate's hold, so the reach
 * alone read the rock still ahead of the front as too little to cut. The cells, which set the
 * cut's speed, stay the front's as #570 reads them wherever it has any: a reach of a whole tick's
 * step (60 m at 3600 m/s) would slow it to its slowest cell anywhere along the way.
 */
export function slabOfStep(front: LeadingSlab, reach: LeadingSlab): LeadingSlab {
  const uncutTiles = front.uncutTiles.length > 0 ? front.uncutTiles : reach.uncutTiles
  return { uncutBp: Math.max(front.uncutBp, reach.uncutBp), uncutTiles }
}

/** In the stamp's cleared core, past the face and within the width of a body of half side `halfMm`. */
function isInSlab(aim: DrillAim, sample: WeightedSample, halfMm: number): boolean {
  if (!isInClearedCore(aim.stamp, sample.weight)) return false
  return aheadOf(aim, sample) >= halfMm && Math.abs(acrossOf(aim, sample)) <= halfMm
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
