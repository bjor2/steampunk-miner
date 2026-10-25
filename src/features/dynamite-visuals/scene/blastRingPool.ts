/**
 * The live charges' ring pool (D7, ticket 866): one quad per planted slot, each drawing the danger
 * ring dashed inside the ground ring in the type's colour, plated in the casing tint once casing
 * will be laid. Written every frame from the ring marks; one draw call.
 */
import { rgbOfHex } from '../../../systems/render/colour'
import { PLANTED_CHARGE_SLOTS } from '../../../constants/scene'
import { RING_DASHES, RING_OPACITY } from '../systems/render/blastLookConstants'
import type { RingMark } from '../systems/render/blastMarks'
import { RING_Z } from './BlastMarksLayer'
import {
  createQuadPool,
  createRingMaterial,
  RING_ATTRIBUTES,
  showQuads,
  type QuadPool,
} from './instancedQuads'

export interface RingPool {
  pool: QuadPool
  resources: { dispose(): void }[]
}

/** The quad reaches this far past the ground ring, so its stroke's soft edge is never cut. */
const QUAD_MARGIN_STROKES = 2

export function createRingPool(): RingPool {
  const material = createRingMaterial(RING_DASHES, RING_OPACITY)
  const pool = createQuadPool(PLANTED_CHARGE_SLOTS, RING_ATTRIBUTES, material)
  pool.mesh.position.z = RING_Z
  return { pool, resources: [pool.mesh.geometry, material] }
}

export function drawRings(rings: RingPool, marks: readonly RingMark[], count: number): void {
  for (let at = 0; at < count; at++) writeRing(rings, at, marks[at])
  showQuads(rings.pool, count)
}

function writeRing(rings: RingPool, at: number, mark: RingMark): void {
  const { aPlace, aRadii, aColour, aCasing } = rings.pool.attributes
  const { strokeM, colour, casingTint } = mark.look
  const width = 2 * (mark.groundRadiusM + strokeM * QUAD_MARGIN_STROKES)
  aPlace.setXYZW(at, mark.x, mark.y, width, mark.turn)
  // The shader measures from the quad's centre at full width: radii as shares of the half width.
  aRadii.setXYZ(at, mark.baseRadiusM / width, mark.groundRadiusM / width, strokeM / width)
  const [r, g, b] = rgbOfHex(colour)
  aColour.setXYZ(at, r, g, b)
  const [cr, cg, cb] = rgbOfHex(casingTint ?? colour)
  aCasing.setXYZW(at, cr, cg, cb, casingTint === null ? 0 : 1)
}
