/**
 * The crater decals' quad pool (D7, ticket 866): every kept crater's decals, oldest first, each cut
 * from the crater atlas, scaled to its ground radius, turned to the planet's radial up and tinted.
 * Rewritten only when the craters changed; one draw call.
 */
import type { Texture } from 'three'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { rgbOfHex } from '../../../systems/render/colour'
import { readCraterMarks } from '../store/blastMarkFeed'
import {
  CRATER_MARKS,
  DECALS_PER_CRATER,
  DECAL_TINT_GAIN,
} from '../systems/render/blastLookConstants'
import type { CraterMark } from '../systems/render/blastMarks'
import { craterAtlasOf, type CraterAtlas } from '../systems/render/craterAtlas'
import { DECAL_Z } from './BlastMarksLayer'
import {
  createDecalMaterial,
  createQuadPool,
  DECAL_ATTRIBUTES,
  showQuads,
  type QuadPool,
} from './instancedQuads'

export interface DecalPool {
  pool: QuadPool
  atlas: CraterAtlas | null
  /** The craters the pool shows; another list is written in before the next draw. */
  shown: readonly CraterMark[] | null
  resources: { dispose(): void }[]
}

export function createDecalPool(map: Texture): DecalPool {
  const material = createDecalMaterial(map, DECAL_TINT_GAIN)
  const pool = createQuadPool(CRATER_MARKS * DECALS_PER_CRATER, DECAL_ATTRIBUTES, material)
  pool.mesh.position.z = DECAL_Z
  return {
    pool,
    atlas: craterAtlasOf(SHIPPED_ART),
    shown: null,
    resources: [pool.mesh.geometry, material],
  }
}

/** Writes the craters in when they changed; the craters held and the decals drawn. */
export function drawDecals(decals: DecalPool): { craters: number; decals: number } {
  const craters = readCraterMarks()
  if (decals.shown !== craters) writeCraters(decals, craters)
  return { craters: craters.length, decals: decals.pool.mesh.geometry.instanceCount }
}

function writeCraters(decals: DecalPool, craters: readonly CraterMark[]): void {
  decals.shown = craters
  let at = 0
  for (const crater of craters) {
    for (const decal of crater.decals)
      at = writeDecal(decals, at, crater, decal.partId, decal.tint, decal.diameterM)
  }
  showQuads(decals.pool, at)
}

function writeDecal(
  decals: DecalPool,
  at: number,
  crater: CraterMark,
  partId: string,
  tint: string,
  diameterM: number,
): number {
  const uv = decals.atlas?.uvByPart[partId]
  if (uv === undefined || at === decals.pool.mesh.geometry.getAttribute('aPlace').count) return at
  const { aPlace, aUv, aTint } = decals.pool.attributes
  aPlace.setXYZW(at, crater.x, crater.y, diameterM, crater.turn)
  aUv.setXYZW(at, uv[0], uv[1], uv[2], uv[3])
  const [r, g, b] = rgbOfHex(tint)
  aTint.setXYZ(at, r, g, b)
  return at + 1
}
