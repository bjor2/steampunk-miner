/**
 * The live charges' ring pool (D7, ticket 866; the G&V row on #869): one quad per planted slot,
 * each drawing the danger ring solid inside the dashed ground ring in the type's colour, plated in
 * the casing tint once casing will be laid, the ground ring cut off at the planet's edge. Written
 * every frame from the ring marks; one draw call.
 */
import { rgbOfHex } from '../../../systems/render/colour'
import { PLANTED_CHARGE_SLOTS } from '../../../constants/scene'
import { RING_DASH_M, RING_OPACITY } from '../systems/render/blastLookConstants'
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
  const material = createRingMaterial(RING_DASH_M, RING_OPACITY)
  const pool = createQuadPool(PLANTED_CHARGE_SLOTS, RING_ATTRIBUTES, material)
  pool.mesh.position.z = RING_Z
  return { pool, resources: [pool.mesh.geometry, material] }
}

/** Draws the first `count` marks; the ground rings stop at `planetRadiusM` (0: none is cut). */
export function drawRings(
  rings: RingPool,
  marks: readonly RingMark[],
  count: number,
  planetRadiusM: number,
): void {
  for (let at = 0; at < count; at++) writeRing(rings, at, marks[at])
  rings.pool.mesh.material.uniforms.uPlanetRadiusM.value = planetRadiusM
  showQuads(rings.pool, count)
}

function writeRing(rings: RingPool, at: number, mark: RingMark): void {
  const { aPlace, aRadii, aColour, aCasing } = rings.pool.attributes
  const { strokeM, colour, casingTint } = mark.look
  const width = 2 * (mark.groundRadiusM + strokeM * QUAD_MARGIN_STROKES)
  aPlace.setXYZW(at, mark.x, mark.y, width, mark.turn)
  // The shader measures from the quad's centre in metres, as the quad's offset is.
  aRadii.setXYZ(at, mark.baseRadiusM, mark.groundRadiusM, strokeM)
  const [r, g, b] = rgbOfHex(colour)
  aColour.setXYZ(at, r, g, b)
  const [cr, cg, cb] = rgbOfHex(casingTint ?? colour)
  aCasing.setXYZW(at, cr, cg, cb, casingTint === null ? 0 : 1)
}
