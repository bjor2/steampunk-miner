import { describe, expect, it } from 'vitest'
import { generateChunk } from './generateChunk'
import { contourSegmentsOf } from './groundContour'
import {
  carveCell,
  carveDisc,
  cellDensitySum,
  clearDisc,
  fillDisc,
  type CellDrillTicks,
} from './groundEdit'
import { planetParamsFor } from './planetParams'
import {
  CHUNK_SAMPLES,
  SAMPLES_PER_TILE,
  chunkOfSample,
  localSampleOf,
  sampleIndexOf,
} from './sampleGrid'
import { chunkKey } from './tileGrid'
import { CELL_KIND, kindOfCell } from './worldCell'
import {
  cellAt,
  currentDensityOfChunk,
  EMPTY_WORLD,
  isTileYielded,
  materialCellAt,
  type WorldState,
} from './worldState'

const params = planetParamsFor(83921, 1)
/** Every cell takes the minimum #7 drill time, so only the stamp's path shapes the hole. */
const EVEN_GROUND: CellDrillTicks = () => 24
const TUNNEL_RADIUS_MM = 950

function densityAt(world: WorldState, sx: number, sy: number): number {
  const density = currentDensityOfChunk(world, params, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

function removedDensity(world: WorldState): number {
  let removed = 0
  for (const key of Object.keys(world.chunks)) {
    const [cx, cy] = key.split(',').map(Number)
    const generated = generateChunk(params, cx, cy).density
    const current = currentDensityOfChunk(world, params, cx, cy)
    for (let index = 0; index < CHUNK_SAMPLES; index++) removed += generated[index] - current[index]
  }
  return removed
}

interface Tunnel {
  world: WorldState
  start: { x: number; y: number }
  direction: { x: number; y: number }
}

/** A scripted stamp path: 8 m in 2 cm steps, one tick per step, through band-1 rock. */
function carveTunnel(degrees: number): Tunnel {
  const radians = (degrees * Math.PI) / 180
  const direction = { x: Math.cos(radians), y: Math.sin(radians) }
  const start = { x: -4 * direction.x - 0.5, y: 284 - 4 * direction.y }
  let world = EMPTY_WORLD
  for (let step = 0; step <= 400; step++) {
    const disc = {
      xMm: Math.round((start.x + direction.x * step * 0.02) * 1000),
      yMm: Math.round((start.y + direction.y * step * 0.02) * 1000),
      radiusMm: TUNNEL_RADIUS_MM,
      floorRadiusMm: null,
    }
    world = carveDisc(world, params, disc, { firstTick: step, ticks: 1 }, EVEN_GROUND).world
  }
  return { world, start, direction }
}

/** Signed distances from the path's line to the contour points along its middle 4 m. */
function wallOffsets(tunnel: Tunnel): number[] {
  const { start, direction } = tunnel
  const segments = contourSegmentsOf(
    { sx0: -60, sy0: 4 * 270, width: 120, height: 120 },
    (sx, sy) => densityAt(tunnel.world, sx, sy),
  )
  const offsets: number[] = []
  for (let at = 0; at < segments.length; at += 2) {
    const dx = segments[at] - start.x
    const dy = segments[at + 1] - start.y
    const along = dx * direction.x + dy * direction.y
    if (along >= 2 && along <= 6) offsets.push(dx * -direction.y + dy * direction.x)
  }
  return offsets
}

describe('carving the density field (#36)', () => {
  const ANGLES = [0, 22.5, 45, 67.5, 90]
  const tunnels = ANGLES.map(carveTunnel)

  it('removes the same total density at 0, 22.5, 45, 67.5 and 90 degrees, within 2%', () => {
    const removed = tunnels.map((tunnel) => removedDensity(tunnel.world))
    const mean = removed.reduce((sum, amount) => sum + amount, 0) / removed.length
    for (const amount of removed) expect(Math.abs(amount - mean) / mean).toBeLessThanOrEqual(0.02)
  })

  it.each(ANGLES.map((angle, index) => [angle, index]))(
    'leaves a floor within 0.05 m of a straight line at %s degrees',
    (_angle, index) => {
      const floor = wallOffsets(tunnels[index]).filter((offset) => offset < 0)
      const mean = floor.reduce((sum, offset) => sum + offset, 0) / floor.length
      expect(floor.length).toBeGreaterThan(10)
      for (const offset of floor) expect(Math.abs(offset - mean)).toBeLessThanOrEqual(0.05)
    },
  )

  it('carves a cell clear in its drill time, slower in harder rock', () => {
    const tile = { tx: 3, ty: 285 }
    const window = (ticks: number) => ({ firstTick: 0, ticks })
    const soft = carveCell(EMPTY_WORLD, params, tile, window(24), () => 24)
    const hard = carveCell(EMPTY_WORLD, params, tile, window(24), () => 48)
    expect(cellDensitySum(soft.world, params, tile)).toBe(0)
    expect(soft.ticksUsed).toBe(24)
    expect(cellDensitySum(hard.world, params, tile)).toBe(16 * (255 - 127))
  })

  it('carves the same bytes in one window as in its ticks one by one', () => {
    const tile = { tx: -2, ty: 283 }
    const once = carveCell(EMPTY_WORLD, params, tile, { firstTick: 100, ticks: 30 }, () => 37)
    let stepped = EMPTY_WORLD
    for (let tick = 100; tick < 130; tick++) {
      stepped = carveCell(stepped, params, tile, { firstTick: tick, ticks: 1 }, () => 37).world
    }
    expect(currentDensityOfChunk(once.world, params, 0, 8)).toEqual(
      currentDensityOfChunk(stepped, params, 0, 8),
    )
  })

  it('yields a cell once, when its 16 samples fall to half', () => {
    const tile = { tx: 1, ty: 286 }
    // 12 of 24 ticks leave 128 in each sample: 2048, just over half of 4080.
    const halfway = carveCell(EMPTY_WORLD, params, tile, { firstTick: 0, ticks: 12 }, EVEN_GROUND)
    expect(halfway.yielded).toEqual([])
    const crossed = carveCell(halfway.world, params, tile, { firstTick: 12, ticks: 1 }, EVEN_GROUND)
    expect(crossed.yielded).toEqual([{ tile, cell: materialCellAt(EMPTY_WORLD, params, tile) }])
    expect(isTileYielded(crossed.world, tile)).toBe(true)
    expect(kindOfCell(cellAt(crossed.world, params, tile))).toBe(CELL_KIND.air)
    const after = carveCell(crossed.world, params, tile, { firstTick: 13, ticks: 20 }, EVEN_GROUND)
    expect(after.yielded).toEqual([])
    const refilled = fillDisc(
      after.world,
      params,
      { xMm: 1500, yMm: 286500, radiusMm: 900, floorRadiusMm: null },
      255,
    )
    const again = carveCell(refilled.world, params, tile, { firstTick: 40, ticks: 40 }, EVEN_GROUND)
    expect(again.yielded).toEqual([])
  })

  it('never carves the dock pad', () => {
    const edit = clearDisc(
      EMPTY_WORLD,
      params,
      { xMm: 0, yMm: 299500, radiusMm: 2000, floorRadiusMm: null },
      255,
    )
    for (let sx = -8; sx < 8; sx++) {
      for (let q = 0; q < SAMPLES_PER_TILE; q++)
        expect(densityAt(edit.world, sx, 299 * 4 + q)).toBe(255)
    }
  })

  it('reports each changed chunk with the samples it touched', () => {
    const edit = carveCell(
      EMPTY_WORLD,
      params,
      { tx: 31, ty: 285 },
      { firstTick: 0, ticks: 5 },
      EVEN_GROUND,
    )
    expect(edit.changes).toEqual([{ cx: 0, cy: 8, x0: 124, y0: 116, x1: 127, y1: 119 }])
    expect(Object.keys(edit.world.chunks)).toEqual([chunkKey(0, 8)])
  })
})
