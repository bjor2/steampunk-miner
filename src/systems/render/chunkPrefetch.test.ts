import { describe, expect, it } from 'vitest'
import { VIEW_HALF_DIAGONAL_MAX_M } from '../../constants/scene'
import { CHUNK_SIZE } from '../world/tileGrid'
import { chunksAheadOf, driveLineOf, type DriveView } from './chunkPrefetch'
import { chunksAlongDriveLine } from './driveLineChunks'
import { visibleChunksAround, type ChunkPoint } from './visibleChunks'

const PLANET_RADIUS_TILES = 100_000
const CENTRE = { x: 16.5, y: 50_000.5 }
const keyOf = ({ cx, cy }: ChunkPoint) => `${cx},${cy}`

function driveAt(velocity: { x: number; y: number }, facing = { x: 1, y: 0 }): DriveView {
  return {
    centre: CENTRE,
    viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
    velocity,
    facing,
    leadSeconds: 2,
    planetRadiusTiles: PLANET_RADIUS_TILES,
  }
}

/** The chunks the view touches at every half metre of the drive, the slow way. */
function chunksSweptBySteps(drive: DriveView): Set<string> {
  const line = driveLineOf(drive)
  const length = Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y)
  const swept = new Set<string>()
  for (let step = 0; step <= length * 2; step++) {
    const t = length === 0 ? 0 : Math.min(1, step / 2 / length)
    const centre = {
      x: line.from.x + (line.to.x - line.from.x) * t,
      y: line.from.y + (line.to.y - line.from.y) * t,
    }
    for (const chunk of visibleChunksAround(centre, drive.viewRadius, PLANET_RADIUS_TILES))
      swept.add(keyOf(chunk))
  }
  return swept
}

describe('chunk prefetch along the drive (ticket 336)', () => {
  it('builds only the facing chunks of ticket 330 while the rig stands still', () => {
    const ahead = chunksAheadOf(driveAt({ x: 0, y: 0 }))
    const inView = new Set(
      visibleChunksAround(CENTRE, VIEW_HALF_DIAGONAL_MAX_M, PLANET_RADIUS_TILES).map(keyOf),
    )
    expect(ahead.length).toBeGreaterThan(0)
    expect(ahead.every(({ cx }) => cx >= 1)).toBe(true)
    expect(ahead.some((chunk) => inView.has(keyOf(chunk)))).toBe(false)
  })

  it('reaches 240 m down the drive at 120 m/s', () => {
    const ahead = chunksAheadOf(driveAt({ x: 0, y: -120 }))
    const lowest = Math.min(...ahead.map(({ cy }) => cy))
    expect(lowest).toBe(Math.floor((CENTRE.y - 240 - VIEW_HALF_DIAGONAL_MAX_M) / CHUNK_SIZE))
  })

  it('holds every chunk the view passes over in the lead, and none it does not', () => {
    for (const velocity of [
      { x: 0, y: -120 },
      { x: 120, y: 0 },
      { x: 84.9, y: -84.9 },
      { x: -30, y: 70 },
    ]) {
      const drive = driveAt(velocity, { x: velocity.x > 0 ? 1 : -1, y: 0 })
      const along = chunksAlongDriveLine(driveLineOf(drive), drive.viewRadius, PLANET_RADIUS_TILES)
      const swept = chunksSweptBySteps(drive)
      expect(along.map(keyOf).filter((key) => !swept.has(key))).toEqual([])
      expect([...swept].filter((key) => !along.some((chunk) => keyOf(chunk) === key))).toEqual([])
    }
  })

  it('leaves out the chunks already in view and lists each chunk once', () => {
    const ahead = chunksAheadOf(driveAt({ x: 84.9, y: -84.9 })).map(keyOf)
    const inView = visibleChunksAround(CENTRE, VIEW_HALF_DIAGONAL_MAX_M, PLANET_RADIUS_TILES).map(
      keyOf,
    )
    expect(ahead.filter((key) => inView.includes(key))).toEqual([])
    expect(new Set(ahead).size).toBe(ahead.length)
  })

  it('lists the drive line in the order the view reaches it', () => {
    const ahead = chunksAheadOf(driveAt({ x: 0, y: -120 }, { x: 0, y: -1 }))
    const rows = ahead.map(({ cy }) => cy)
    expect(rows).toEqual([...rows].sort((a, b) => b - a))
  })

  it('builds further ahead with a longer lead', () => {
    const twoSeconds = chunksAheadOf(driveAt({ x: 120, y: 0 }))
    const threeSeconds = chunksAheadOf({ ...driveAt({ x: 120, y: 0 }), leadSeconds: 3 })
    expect(threeSeconds.length).toBeGreaterThan(twoSeconds.length)
  })

  it('never reaches past the planet diameter', () => {
    const drive = { ...driveAt({ x: 0, y: -1e9 }), planetRadiusTiles: 300 }
    const line = driveLineOf(drive)
    expect(Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y)).toBeCloseTo(600, 6)
  })
})
