/**
 * The ring mesh a planet's sky band is drawn on (GD ruling on #293 Q1, `PlanetSkyBand`): a strip
 * of quads round the planet's centre from `heightM` above the surface to `thicknessM` past that,
 * built once per planet. Each vertex carries where it lies along the band, counted in ribbons, and
 * across it (0 at the lower edge, 1 at the upper), so the shader repeats the ribbon texture a whole
 * number of times round the planet and the strip closes with no seam.
 */
import { SKY_BAND_STEP_M } from '../../constants/scene'
import type { PlanetSkyBandLook } from '../registries/planetSkyBand'

export interface SkyBandRing {
  /** x, y, z of each vertex: the lower edge's vertex, then the upper edge's, step by step. */
  positions: Float32Array
  /** Along (in ribbons, 0 to `ribbonsRound`) and across (0 to 1) the band, per vertex. */
  bandCoords: Float32Array
  /** Two triangles a step, counter-clockwise as the camera sees them, so neither is culled. */
  indices: Uint32Array
  /** Whole ribbons round the planet. */
  ribbonsRound: number
}

const FULL_TURN = 2 * Math.PI

/** The band's ring round a planet of `radiusTiles`, its ribbon about `ribbonLengthM` long. */
export function skyBandRingOf(
  radiusTiles: number,
  look: Pick<PlanetSkyBandLook, 'heightM' | 'thicknessM'>,
  ribbonLengthM: number,
): SkyBandRing {
  const innerM = radiusTiles + look.heightM
  const steps = stepsRound(innerM)
  const ribbonsRound = Math.max(1, Math.round((FULL_TURN * innerM) / ribbonLengthM))
  return {
    positions: ringPositionsOf(steps, innerM, innerM + look.thicknessM),
    bandCoords: ringBandCoordsOf(steps, ribbonsRound),
    indices: ringIndicesOf(steps),
    ribbonsRound,
  }
}

function stepsRound(radiusM: number): number {
  return Math.ceil((FULL_TURN * radiusM) / SKY_BAND_STEP_M)
}

/** Steps + 1 pairs of vertices: the last pair repeats the first, so its coordinate can close. */
function ringPositionsOf(steps: number, innerM: number, outerM: number): Float32Array {
  const positions = new Float32Array((steps + 1) * 2 * 3)
  for (let step = 0; step <= steps; step++) {
    const angle = (FULL_TURN * step) / steps
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    positions.set([innerM * cos, innerM * sin, 0, outerM * cos, outerM * sin, 0], step * 6)
  }
  return positions
}

function ringBandCoordsOf(steps: number, ribbonsRound: number): Float32Array {
  const coords = new Float32Array((steps + 1) * 2 * 2)
  for (let step = 0; step <= steps; step++) {
    const along = (ribbonsRound * step) / steps
    coords.set([along, 0, along, 1], step * 4)
  }
  return coords
}

function ringIndicesOf(steps: number): Uint32Array {
  const indices = new Uint32Array(steps * 6)
  for (let step = 0; step < steps; step++) {
    const lower = step * 2
    indices.set([lower, lower + 1, lower + 2, lower + 1, lower + 3, lower + 2], step * 6)
  }
  return indices
}
