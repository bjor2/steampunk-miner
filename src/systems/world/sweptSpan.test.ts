import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { carveDisc, type CarveWindow, type CellDrillTicks } from './groundEdit'
import { planetParamsFor } from './planetParams'
import { chunkOfSample } from './sampleGrid'
import { discSamplesOf, type DiscStamp } from './stampShape'
import { spanRunsOf, walkStampPerChunk } from './sweptSpan'
import type { TilePoint } from './tileGrid'
import { EMPTY_WORLD } from './worldState'

// The swept span (ticket 374) walks a stamp's samples per chunk in the row walk's own order, so a
// carve over it is the row walk's carve byte for byte; these are the world-layer half of the
// reference test in `authority/sweptSpanDrill.test.ts`.

const params = planetParamsFor(83921, 1)
const RADIUS_MM = 950
/** A chunk corner 44 tiles under planet 1's surface: (32, 256) m. */
const CORNER = { xMm: 32_000, yMm: 256_000 }
const ANGLES_DEGREES = Array.from({ length: 24 }, (_, index) => index * 15)
const LENGTHS_MM = [0, 125, 300, 1667, 5_000, 40_000]

/** A capsule whose path ends `lengthMm` from its tail at `degrees`, its tail near `CORNER`. */
function capsuleAt(degrees: number, lengthMm: number, offsetMm = 137): DiscStamp {
  const radians = (degrees * Math.PI) / 180
  const tail = { xMm: CORNER.xMm - offsetMm, yMm: CORNER.yMm + offsetMm / 2 }
  return {
    xMm: tail.xMm + Math.round(Math.cos(radians) * lengthMm),
    yMm: tail.yMm + Math.round(Math.sin(radians) * lengthMm),
    radiusMm: RADIUS_MM,
    floorRadiusMm: null,
    tail,
  }
}

const CAPSULES: readonly DiscStamp[] = ANGLES_DEGREES.flatMap((degrees) =>
  LENGTHS_MM.map((lengthMm) => capsuleAt(degrees, lengthMm)),
)

/** Cells of uneven drill time, with a gated (undrillable) cell every so often. */
function unevenGround(asked: string[]): CellDrillTicks {
  return (tile: TilePoint, _material, casingGrade) => {
    asked.push(`${tile.tx},${tile.ty}#${casingGrade}`)
    if ((tile.tx * 5 + tile.ty * 3) % 11 === 0) return null
    return (20 + ((tile.tx * 7 + tile.ty * 13) & 31)) * DRILL_SUBSTEPS_PER_TICK
  }
}

const ONE_TICK: CarveWindow = { firstTick: 40, ticks: 1, subStepsPerTick: DRILL_SUBSTEPS_PER_TICK }

describe('swept span per chunk (ticket 374)', () => {
  it('lists the samples of the row walk, with their weights and floors, in its order', () => {
    for (const capsule of CAPSULES) {
      expect(spanRunsOf(capsule).flatMap((run) => run.samples)).toEqual(discSamplesOf(capsule))
    }
  })

  it('lists the row walk under a level floor and 10^6 tiles from the planet centre', () => {
    const far = 1_000_000_000
    const floored = [0, 45, 100, 200, 300].map((degrees) => ({
      ...capsuleAt(degrees, 3_000),
      floorRadiusMm: Math.round(Math.hypot(CORNER.xMm, CORNER.yMm)),
    }))
    expect(floored.some((capsule) => discSamplesOf(capsule).some(({ floor }) => floor > 0))).toBe(
      true,
    )
    const distant = [30, 120, 250].map((degrees) => {
      const capsule = capsuleAt(degrees, 3_000)
      const tail = capsule.tail as { xMm: number; yMm: number }
      return { ...capsule, yMm: capsule.yMm + far, tail: { ...tail, yMm: tail.yMm + far } }
    })
    for (const capsule of [...floored, ...distant]) {
      expect(spanRunsOf(capsule).flatMap((run) => run.samples)).toEqual(discSamplesOf(capsule))
    }
  })

  it('keeps every run inside one chunk', () => {
    const runs = CAPSULES.flatMap(spanRunsOf)
    expect(new Set(runs.map(({ cx, cy }) => `${cx},${cy}`)).size).toBeGreaterThan(1)
    for (const { cx, cy, samples } of runs) {
      for (const { sx, sy } of samples)
        expect([chunkOfSample(sx), chunkOfSample(sy)]).toEqual([cx, cy])
    }
  })

  it('carves what the row walk carves across a chunk corner, asking the cells in its order', () => {
    let changedChunks = 0
    for (const capsule of CAPSULES) {
      const [rowAsks, spanAsks]: string[][] = [[], []]
      const rows = carveDisc(EMPTY_WORLD, params, capsule, ONE_TICK, unevenGround(rowAsks))
      const span = carveDisc(
        EMPTY_WORLD,
        params,
        capsule,
        ONE_TICK,
        unevenGround(spanAsks),
        walkStampPerChunk,
      )
      expect(span).toEqual(rows)
      expect(spanAsks).toEqual(rowAsks)
      changedChunks = Math.max(changedChunks, rows.changes.length)
    }
    expect(changedChunks).toBeGreaterThanOrEqual(4)
  })
})
