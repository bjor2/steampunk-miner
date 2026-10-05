import { describe, expect, it } from 'vitest'
import { CAMERA_ZOOM, MAX_CHUNK_DRAW_CALLS, REFERENCE_VIEWPORT } from '../../constants/scene'
import { planetParamsFor } from '../world/planetParams'
import { chunkOfTile } from '../world/tileGrid'
import { viewRadiusOf, visibleChunksAround } from './visibleChunks'

const radiusTiles = planetParamsFor(1, 1).radiusTiles
const referenceRadius = viewRadiusOf(
  REFERENCE_VIEWPORT.width,
  REFERENCE_VIEWPORT.height,
  CAMERA_ZOOM,
)

function centresAcrossPlanet(): { x: number; y: number }[] {
  const centres = []
  for (let y = -radiusTiles; y <= radiusTiles; y += 7.3) {
    for (let x = -radiusTiles; x <= radiusTiles; x += 7.3) centres.push({ x, y })
  }
  return centres
}

describe('visible chunks', () => {
  it('sees half the reference screen diagonal: about 64 by 40 tiles at the #4 zoom', () => {
    expect(referenceRadius).toBeCloseTo(37.74, 2)
  })

  it('never asks for more than 16 chunk draws at the reference screen, anywhere on the planet', () => {
    const counts = centresAcrossPlanet().map(
      (centre) => visibleChunksAround(centre, referenceRadius, radiusTiles).length,
    )
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_CHUNK_DRAW_CALLS)
  })

  it('covers every point the screen can show at any rotation', () => {
    const centre = { x: -150.5, y: 120.25 }
    const chunks = visibleChunksAround(centre, referenceRadius, radiusTiles)
    for (let step = 0; step < 64; step++) {
      const angle = (step / 64) * 2 * Math.PI
      const x = centre.x + Math.cos(angle) * referenceRadius * 0.999
      const y = centre.y + Math.sin(angle) * referenceRadius * 0.999
      expect(chunks).toContainEqual({ cx: chunkOfTile(x), cy: chunkOfTile(y) })
    }
  })

  it('skips chunks that hold no tile of the planet', () => {
    const chunks = visibleChunksAround({ x: 0, y: radiusTiles + 30 }, referenceRadius, radiusTiles)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.every(({ cy }) => cy * 32 <= radiusTiles)).toBe(true)
  })

  it('lists the chunk under the camera first', () => {
    const [first] = visibleChunksAround({ x: 10.5, y: 290.5 }, referenceRadius, radiusTiles)
    expect(first).toEqual({ cx: 0, cy: 9 })
  })
})
