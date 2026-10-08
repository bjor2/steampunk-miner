import { describe, expect, it } from 'vitest'
import { SKY_BAND_STEP_M } from '../../constants/scene'
import { skyBandRingOf } from './skyBandRing'

const RADIUS = 300
const LOOK = { heightM: 3, thicknessM: 4 }

function radiiOf(positions: Float32Array): number[] {
  const radii: number[] = []
  for (let at = 0; at < positions.length; at += 3)
    radii.push(Math.hypot(positions[at], positions[at + 1]))
  return radii
}

describe('sky band ring', () => {
  it('runs from the band height above the surface to its thickness past that', () => {
    const radii = radiiOf(skyBandRingOf(RADIUS, LOOK, 24).positions)
    const lower = radii.filter((_, at) => at % 2 === 0)
    const upper = radii.filter((_, at) => at % 2 === 1)
    lower.forEach((radius) => expect(radius).toBeCloseTo(303, 3))
    upper.forEach((radius) => expect(radius).toBeCloseTo(307, 3))
  })

  it('cuts the ring into steps no longer than the step length', () => {
    const ring = skyBandRingOf(RADIUS, LOOK, 24)
    const steps = ring.indices.length / 6
    expect((2 * Math.PI * 303) / steps).toBeLessThanOrEqual(SKY_BAND_STEP_M)
    expect(ring.positions.length).toBe((steps + 1) * 2 * 3)
  })

  it('repeats a whole number of ribbons round the planet, so the strip closes with no seam', () => {
    const ring = skyBandRingOf(RADIUS, LOOK, 24)
    expect(ring.ribbonsRound).toBe(Math.round((2 * Math.PI * 303) / 24))
    const lastAlong = ring.bandCoords[ring.bandCoords.length - 2]
    expect(lastAlong).toBe(ring.ribbonsRound)
    expect(Array.from(ring.positions.slice(-6))).toEqual(
      Array.from(ring.positions.slice(0, 6)).map((value, at) =>
        expect.closeTo(value, at % 3 === 2 ? 9 : 2),
      ),
    )
  })

  it('marks the lower edge 0 and the upper edge 1 across the band', () => {
    const across = skyBandRingOf(RADIUS, LOOK, 24).bandCoords.filter((_, at) => at % 2 === 1)
    expect(across.slice(0, 4)).toEqual(new Float32Array([0, 1, 0, 1]))
  })

  it('winds every triangle counter-clockwise towards the camera, so none is culled', () => {
    const { positions, indices } = skyBandRingOf(RADIUS, LOOK, 24)
    const signedAreas = Array.from({ length: indices.length / 3 }, (_, at) => {
      const [a, b, c] = [0, 1, 2].map((corner) => indices[at * 3 + corner] * 3)
      const abx = positions[b] - positions[a]
      const aby = positions[b + 1] - positions[a + 1]
      const acx = positions[c] - positions[a]
      const acy = positions[c + 1] - positions[a + 1]
      return abx * acy - aby * acx
    })
    expect(signedAreas.filter((area) => area <= 0)).toEqual([])
  })

  it('draws at least one ribbon round, however long the ribbon', () => {
    expect(skyBandRingOf(RADIUS, LOOK, 1e6).ribbonsRound).toBe(1)
  })
})
