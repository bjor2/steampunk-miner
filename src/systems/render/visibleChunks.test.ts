import { describe, expect, it } from 'vitest'
import {
  MAX_CHUNK_DRAW_CALLS,
  MAX_DRAWN_CHUNKS_AT_MAX_ZOOM,
  REFERENCE_VIEWPORT,
  VIEW_SHORT_AXIS_DEFAULT_M,
  VIEW_SHORT_AXIS_MAX_M,
} from '../../constants/scene'
import { planetParamsFor } from '../world/planetParams'
import { chunkOfTile } from '../world/tileGrid'
import { viewRadiusOf, visibleChunksAround } from './visibleChunks'
import { pixelsPerMetreOf } from './viewZoom'

const radiusTiles = planetParamsFor(1, 1).radiusTiles

function viewRadiusAt(width: number, height: number, viewShortAxisMetres: number): number {
  return viewRadiusOf(width, height, pixelsPerMetreOf(width, height, viewShortAxisMetres))
}

const referenceRadius = viewRadiusAt(
  REFERENCE_VIEWPORT.width,
  REFERENCE_VIEWPORT.height,
  VIEW_SHORT_AXIS_MAX_M,
)

function mostChunksAcrossPlanet(viewRadius: number): number {
  const counts = centresAcrossPlanet().map(
    (centre) => visibleChunksAround(centre, viewRadius, radiusTiles).length,
  )
  return Math.max(...counts)
}

function centresAcrossPlanet(): { x: number; y: number }[] {
  const centres = []
  for (let y = -radiusTiles; y <= radiusTiles; y += 7.3) {
    for (let x = -radiusTiles; x <= radiusTiles; x += 7.3) centres.push({ x, y })
  }
  return centres
}

describe('visible chunks', () => {
  it('sees a circle of 12.2 m at the default zoom and 20.4 m at the widest, on a 16:9 screen (#38)', () => {
    expect(viewRadiusAt(1920, 1080, VIEW_SHORT_AXIS_DEFAULT_M)).toBeCloseTo(12.24, 2)
    expect(viewRadiusAt(3840, 2160, VIEW_SHORT_AXIS_MAX_M)).toBeCloseTo(20.4, 1)
  })

  it('draws the same chunks at 1080p and 4K for the same zoom', () => {
    const centre = { x: -150.5, y: 120.25 }
    expect(visibleChunksAround(centre, viewRadiusAt(3840, 2160, 20), radiusTiles)).toEqual(
      visibleChunksAround(centre, viewRadiusAt(1920, 1080, 20), radiusTiles),
    )
  })

  it('never asks for more than 9 chunks at the 20 m zoom-out on a 4K screen, anywhere on the planet', () => {
    const radius = viewRadiusAt(3840, 2160, VIEW_SHORT_AXIS_MAX_M)
    expect(mostChunksAcrossPlanet(radius)).toBeLessThanOrEqual(MAX_DRAWN_CHUNKS_AT_MAX_ZOOM)
  })

  it('never asks for more than 16 chunk draws at the reference screen, anywhere on the planet', () => {
    expect(mostChunksAcrossPlanet(referenceRadius)).toBeLessThanOrEqual(MAX_CHUNK_DRAW_CALLS)
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
