import { describe, expect, it } from 'vitest'
import { POP_MERGE_WINDOW_SECONDS, POP_RESERVED_SLOTS } from '../../constants/materialPop'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { SPRAY_CAPACITY } from '../../constants/spray'
import type { DomainEvent } from '../authority/domainEvent'
import { oreTier } from '../economy/oreEconomy'
import { createSprayPool, stepSprayPool, type SprayPool } from '../render/sprayPool'
import { bandOfTile } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import type { CarvedCell } from './carveWatch'
import { createPopTally } from './popThinning'
import { createPopIntake, popCarvedCells, type PopIntake } from './popIntake'
import { NO_POP_LADDER } from './popLook'

// The VS rows on #442 for option B (ticket 616): at 84, 840 and 8400 m/s on an all-rare slab and
// a common slab, the 96-piece pool never overflows, every rare material clearing in a 0.25 s
// window shows at least one pop, and the frame cost is logged. About 1.4, 14 and 140 cells clear
// a tick. The intake runs as the scene runs it, at 30 and 144 frames a second.

const PLANET_1 = planetParamsFor(1, 1)
/** A level row of cells inside one band, so every cell's step is the slab's. */
const ROW_TY = PLANET_1.radiusTiles - 8
const SECONDS = 2
const WINDOW_TICKS = POP_MERGE_WINDOW_SECONDS * TICKS_PER_SECOND
const PLAYER = 'p1'

interface Slab {
  name: string
  /** Material id and its rarity step, cleared in turn. */
  materials: readonly (readonly [string, number])[]
}

const ALL_RARE: Slab = {
  name: 'all-rare',
  materials: [
    ['ruby', 2],
    ['sapphire', 3],
    ['emerald', 4],
  ],
}
const COMMON: Slab = {
  name: 'common',
  materials: [
    ['copper', 0],
    ['tin', 0],
  ],
}

function carvedCellOf(tx: number, tick: number, [oreId, step]: readonly [string, number]) {
  const tier = oreTier(1, bandOfTile(PLANET_1, tx, ROW_TY)) + step
  const stamp = { tick, playerId: PLAYER, seq: 1 }
  const destroyed: DomainEvent = { type: 'TileDestroyed', tx, ty: ROW_TY, kind: 'ore', ...stamp }
  const unit = { amount: 1, value: '1', depthTiles: 8, chunk: '0,0', resourceTier: tier, oreId }
  const added: DomainEvent = { type: 'CargoAdded', ...unit, ...stamp }
  return { tile: { tx, ty: ROW_TY }, tick, yieldEvents: [destroyed, added] } satisfies CarvedCell
}

interface Shown {
  /** Per window, the materials that started or merged into a pop in it. */
  byWindow: Map<number, Set<string>>
  /** Per window, the materials that cleared a cell in it. */
  clearedByWindow: Map<number, Set<string>>
}

/** Wraps the intake's sink so every start and merge is seen with its material and window. */
function watchShownPops(intake: PopIntake, shown: Shown, tickNow: () => number): void {
  const { startPop, mergeIntoPop } = intake.sink
  const materialOf = new Map<number, string>()
  const note = (materialId: string) => noteIn(shown.byWindow, tickNow(), materialId)
  intake.sink = {
    startPop: (find, serial) => {
      materialOf.set(serial, find.materialId)
      note(find.materialId)
      return startPop(find, serial)
    },
    mergeIntoPop: (serial) => {
      note(materialOf.get(serial) ?? '')
      mergeIntoPop(serial)
    },
  }
}

function noteIn(windows: Map<number, Set<string>>, tick: number, materialId: string): void {
  const window = Math.floor(tick / WINDOW_TICKS)
  const seen = windows.get(window) ?? new Set<string>()
  seen.add(materialId)
  windows.set(window, seen)
}

interface Row {
  poolMost: number
  guardedMost: number
  shown: Shown
  frameMicros: number[]
  dropped: number
}

function runRow(speed: number, slab: Slab, framesPerSecond: number): Row {
  const pool: SprayPool = createSprayPool()
  const scene = { rig: rigAtRow(), ladder: NO_POP_LADDER }
  const tallies = { spray: { requested: 0, dropped: 0, evicted: 0 }, pops: createPopTally() }
  const intake = createPopIntake(pool, scene, tallies)
  const shown: Shown = { byWindow: new Map(), clearedByWindow: new Map() }
  let tick = 0
  watchShownPops(intake, shown, () => tick)
  const row: Row = { poolMost: 0, guardedMost: 0, shown, frameMicros: [], dropped: 0 }
  let owedCells = 0
  let owedFrames = 0
  let tx = 0
  for (tick = 1; tick <= SECONDS * TICKS_PER_SECOND; tick++) {
    owedCells += speed / TICKS_PER_SECOND
    const cells: CarvedCell[] = []
    for (; owedCells >= 1; owedCells--, tx++) {
      const material = slab.materials[tx % slab.materials.length]
      cells.push(carvedCellOf(tx, tick, material))
      noteIn(shown.clearedByWindow, tick, material[0])
    }
    const startedMs = performance.now()
    popCarvedCells(intake, cells, PLANET_1, tick)
    owedFrames += framesPerSecond / TICKS_PER_SECOND
    for (; owedFrames >= 1; owedFrames--) stepSprayPool(pool, 1 / framesPerSecond)
    row.frameMicros.push(Math.round((performance.now() - startedMs) * 1000))
    row.poolMost = Math.max(row.poolMost, pool.particles.count)
    row.guardedMost = Math.max(row.guardedMost, pool.guardedCount)
  }
  row.dropped = tallies.pops.dropped
  return row
}

function rigAtRow() {
  const y = ROW_TY + 1.5
  return { x: 0.5, y, up: { x: 0, y: 1 }, ahead: { x: 1, y: 0 }, nose: { x: 1.5, y } }
}

function logFrameCost(label: string, micros: number[]): void {
  const sorted = [...micros].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length / 2)]
  const p95 = sorted[Math.floor(sorted.length * 0.95)]
  console.info(`material pop ${label}: intake+step per tick p50 ${p50} µs, p95 ${p95} µs`)
}

/** Every window's cleared rare materials, less those that showed a pop in it. */
function unshownRares(shown: Shown): string[] {
  return [...shown.clearedByWindow].flatMap(([window, cleared]) =>
    [...cleared]
      .filter((materialId) => !(shown.byWindow.get(window)?.has(materialId) ?? false))
      .map((materialId) => `${materialId}@${window}`),
  )
}

describe('material pop rows', () => {
  for (const speed of [84, 840, 8400]) {
    for (const framesPerSecond of [30, 144]) {
      it(`keeps the pool within 96 and shows every rare each 0.25 s at ${speed} m/s, ${framesPerSecond} fps`, () => {
        const row = runRow(speed, ALL_RARE, framesPerSecond)
        logFrameCost(`${ALL_RARE.name} ${speed} m/s ${framesPerSecond} fps`, row.frameMicros)
        expect(row.poolMost).toBeLessThanOrEqual(SPRAY_CAPACITY)
        expect(row.guardedMost).toBeLessThanOrEqual(POP_RESERVED_SLOTS)
        expect(unshownRares(row.shown)).toEqual([])
        expect(row.dropped).toBe(0)
      })

      it(`keeps the pool within 96 on a common slab at ${speed} m/s, ${framesPerSecond} fps`, () => {
        const row = runRow(speed, COMMON, framesPerSecond)
        logFrameCost(`${COMMON.name} ${speed} m/s ${framesPerSecond} fps`, row.frameMicros)
        expect(row.poolMost).toBeLessThanOrEqual(SPRAY_CAPACITY)
        expect(row.guardedMost).toBe(0)
      })
    }
  }
})
