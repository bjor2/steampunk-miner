import { beforeAll, describe, expect, it } from 'vitest'
import {
  CASING_RING_LAG_MM,
  CASING_RING_SPACING_MM,
  DRILL_STAMP_RADIUS_MM,
} from '../../constants/balance'
import { withRegistrations } from '../../registries/registrar'
import { CUT_ENERGY_DENOMINATOR } from '../vehicle/cutCarry'
import { cellDensitySum, YIELD_SUM } from '../world/cellYield'
import { planetParamsFor } from '../world/planetParams'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { chunkOfTile, type TilePoint } from '../world/tileGrid'
import { generatedChunkOf, isGeneratedChunkHeld } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { energyNumeratorOfLawWork } from './cutCarryFixtures'
import type { DomainEvent } from './domainEvent'
import { isUnderRatchet, isUnderTankFloor, lawChargeBarsOf } from './lawChargeBars'
import { PARAMS, WORLD_SEED } from './scriptedSession'
import {
  COLUMN,
  cutSpeedSlab,
  CUTTING_PLAYER,
  GATE_OPENS_AT_TICK,
  RUN_TICKS,
  SLAB_GATE,
  SLAB_TILES,
  slabRigOf,
  strideOfSpeed,
  type SlabRun,
} from './speedSlabFixtures'
import { stateDigest } from './stateDigest'

// The speed-scaling bars of ticket 560 (#551 ticket C, the TD's row as GD amendment 3 placed it):
// the scripted planet-1 column of `speedSlabFixtures.ts` cut by `drillStep` a tick at 84 and 840
// m/s through the shipped path, the rig's own step bound clamping every stride. At each speed: ten
// seconds of ticks with no refusal; the gate stops the carry dead and reports once; the first ore,
// the gated ore and the cache cell each yield once; the cut breaks every cell its path crosses and
// none off it; the tank pays the law work removed exactly, within the integer carry, under the
// tank floor (1.25) and the ratchet (1.098); its events run in walk order, credited to the cutting
// player; a second run leaves the same digest. 8400 m/s lies past the 3600 m/s sub-step floor
// until #558 lifts it. The tick-time bar is the lane's (`speedScaling.lane.test.ts`).

const SPEEDS_M_PER_S = [84, 840]
/** The rock round the bore's cells, by distance from the axis: inside its stamp, or within reach. */
const CROSSED_REACH_MM = DRILL_STAMP_RADIUS_MM - MM_PER_SAMPLE
const TOUCHED_REACH_MM = DRILL_STAMP_RADIUS_MM + MM_PER_SAMPLE
const AXIS_X_MM = COLUMN * 1000 + 500

const cutGated = (speed: number) =>
  withRegistrations([SLAB_GATE], () => cutSpeedSlab(slabRigOf(strideOfSpeed(speed))))

const isTile = (event: DomainEvent, tile: TilePoint) =>
  'tx' in event && 'ty' in event && event.tx === tile.tx && event.ty === tile.ty

const eventsAt = (run: SlabRun, type: DomainEvent['type'], tile: TilePoint) =>
  run.events.filter((event) => event.type === type && isTile(event, tile))

const destroyedOf = (run: SlabRun) => run.events.filter((event) => event.type === 'TileDestroyed')

const keyOf = (tile: TilePoint) => `${tile.tx},${tile.ty}`

/** Cells round the column from the surface to past the cut's foot, in row order. */
function cellsRoundTheBore(run: SlabRun): TilePoint[] {
  const floorTy = Math.floor((run.cutFootYMm - TOUCHED_REACH_MM) / 1000)
  const tiles: TilePoint[] = []
  for (let ty = floorTy; ty <= SLAB_TILES.firstOre.ty + 8; ty++) {
    for (let tx = COLUMN - 3; tx <= COLUMN + 3; tx++) tiles.push({ tx, ty })
  }
  return tiles
}

function cursorOf(state: AuthorityState) {
  const cursor = vehicleOf(state, CUTTING_PLAYER).sweptCut
  if (cursor === undefined) throw new Error('the rig never stepped')
  return cursor
}

/** The farthest and the nearest a cell's square lies from the bore's axis, down to `footYMm`. */
function reachOfCell(tile: TilePoint, footYMm: number): { far: number; near: number } {
  const xs = [tile.tx * 1000 - AXIS_X_MM, (tile.tx + 1) * 1000 - AXIS_X_MM]
  const below = (y: number) => Math.max(0, footYMm - y)
  const ys = [tile.ty * 1000, (tile.ty + 1) * 1000].map(below)
  const far = Math.max(...xs.flatMap((dx) => ys.map((dy) => lengthOf(dx, dy))))
  const nearX = xs[0] <= 0 && xs[1] >= 0 ? 0 : Math.min(...xs.map(Math.abs))
  return { far, near: lengthOf(nearX, Math.min(...ys)) }
}

function lengthOf(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy)
}

function isSolidAt(state: AuthorityState, tile: TilePoint): boolean {
  return cellDensitySum(state.world, PARAMS, tile) > YIELD_SUM
}

/** The cells the swept stamp wholly crossed that were rock, and every cell it could reach. */
function pathCellsOf(run: SlabRun): { crossed: string[]; touched: Set<string> } {
  const footYMm = run.cutFootYMm
  const cells = cellsRoundTheBore(run).map((tile) => ({ tile, reach: reachOfCell(tile, footYMm) }))
  const crossed = cells
    .filter(({ tile, reach }) => reach.far <= CROSSED_REACH_MM && isSolidAt(run.start, tile))
    .map(({ tile }) => keyOf(tile))
  const touched = cells.filter(({ reach }) => reach.near <= TOUCHED_REACH_MM)
  return { crossed, touched: new Set(touched.map(({ tile }) => keyOf(tile))) }
}

/** What the rig charged over the run, in the carry's numerator, and the law work it removed. */
function chargeOf(run: SlabRun): { charged: number; law: number } {
  const carryOf = (state: AuthorityState) => vehicleOf(state, CUTTING_PLAYER).cutEnergyCarry ?? 0
  const carried = carryOf(run.end) - carryOf(run.start)
  return {
    charged: run.energy * CUT_ENERGY_DENOMINATOR + carried,
    law: energyNumeratorOfLawWork(run.lawWork),
  }
}

/** The cells under the gate, round the bore, that the gate must keep whole while it holds. */
function cellsUnderTheGate(): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let ty = SLAB_TILES.foot.ty; ty < SLAB_TILES.gated.ty; ty++) {
    for (let tx = COLUMN - 2; tx <= COLUMN + 2; tx++) tiles.push({ tx, ty })
  }
  return [SLAB_TILES.gated, ...tiles]
}

describe.each(SPEEDS_M_PER_S)('the speed-scaling slab at %i m/s (ticket 560)', (speed) => {
  let run: SlabRun
  beforeAll(() => {
    run = cutGated(speed)
  })

  it('cuts ten seconds of steps at its stride with no refusal and rests at the column foot', () => {
    expect(run.events.filter((event) => event.type === 'CommandRejected')).toEqual([])
    expect(RUN_TICKS).toBeGreaterThanOrEqual(600)
    expect(run.arrivedTick).not.toBeNull()
    expect(RUN_TICKS - (run.arrivedTick ?? RUN_TICKS)).toBeGreaterThanOrEqual(130)
    expect(cursorOf(run.end).yMm).toBeLessThan(SLAB_TILES.foot.ty * 1000)
  })

  it('stops the carry dead at the gated cell until it opens, carving nothing under it', () => {
    const held = run.heldAtGate
    for (const tile of cellsUnderTheGate()) {
      expect(cellDensitySum(held.world, PARAMS, tile)).toBe(
        cellDensitySum(run.start.world, PARAMS, tile),
      )
    }
    const cursor = cursorOf(held)
    expect(cursor.yMm).toBeGreaterThanOrEqual((SLAB_TILES.gated.ty + 1) * 1000)
    expect(cursor.yMm).toBeLessThan((SLAB_TILES.gated.ty + 1) * 1000 + MM_PER_SAMPLE / 2)
    expect(cursor.carrySubSteps).toBe(0)
  })

  it('reports the gated cell once, refused, before the gate opens', () => {
    const gated = run.events.filter((event) => event.type === 'DrillGated')
    expect(gated.map((event) => [event.tx, event.ty, event.outcome])).toEqual([
      [SLAB_TILES.gated.tx, SLAB_TILES.gated.ty, 'refused'],
    ])
    expect(gated[0].tick).toBeLessThan(GATE_OPENS_AT_TICK)
  })

  it('yields the first ore, the gated ore and the cache cell once each', () => {
    for (const tile of [SLAB_TILES.firstOre, SLAB_TILES.gated, SLAB_TILES.cache]) {
      expect(eventsAt(run, 'TileDestroyed', tile)).toHaveLength(1)
    }
    expect(eventsAt(run, 'TileDestroyed', SLAB_TILES.cache)[0]).toMatchObject({ kind: 'ground' })
    expect(run.events.filter((event) => event.type === 'CargoAdded')).toHaveLength(2)
  })

  it('breaks every cell its path crosses and none off it', () => {
    const broken = destroyedOf(run).map(keyOf)
    const { crossed, touched } = pathCellsOf(run)
    expect(crossed.length).toBeGreaterThan(20)
    expect(crossed.filter((cell) => !broken.includes(cell))).toEqual([])
    expect(broken.filter((cell) => !touched.has(cell))).toEqual([])
    expect(new Set(broken).size).toBe(broken.length)
  })

  it('pays the law work it removed exactly, under the tank floor and the ratchet', () => {
    const { charged, law } = chargeOf(run)
    expect(charged).toBe(law)
    const bars = lawChargeBarsOf({ lawWork: run.lawWork, energy: run.energy, heatTicks: 0 })
    expect(bars.expectedQuanta).toBeGreaterThan(0)
    expect(isUnderTankFloor(bars.energyRatio)).toBe(true)
    expect(isUnderRatchet(bars.energyRatio)).toBe(true)
  })

  it('fires its cell events once each, in walk order, credited to the cutting player', () => {
    expect(new Set(run.events.map((event) => event.playerId))).toEqual(new Set([CUTTING_PLAYER]))
    const down = destroyedOf(run).filter((event) => event.tx === COLUMN)
    const rows = down.map((event) => event.ty)
    expect(rows).toEqual([...rows].sort((a, b) => b - a))
    const ticks = down.map((event) => event.tick)
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
    const at = (event: DomainEvent | undefined) => (event ? run.events.indexOf(event) : -1)
    const [firstOre] = eventsAt(run, 'TileDestroyed', SLAB_TILES.firstOre)
    const [gate] = eventsAt(run, 'DrillGated', SLAB_TILES.gated)
    const [gatedOre] = eventsAt(run, 'TileDestroyed', SLAB_TILES.gated)
    const [cache] = eventsAt(run, 'TileDestroyed', SLAB_TILES.cache)
    expect(at(firstOre)).toBeLessThan(at(gate))
    expect(at(gate)).toBeLessThan(at(gatedOre))
    expect(at(gatedOre)).toBeLessThan(at(cache))
  })

  it('leaves the same digest when cut again', () => {
    expect(stateDigest(cutGated(speed).end)).toBe(stateDigest(run.end))
  })
})

describe('the speed-scaling slab past the sub-step floor (ticket 560)', () => {
  it.todo('holds every bar at 8400 m/s once #558 lifts the 3600 m/s sub-step floor')
})

/** Each tick's casing trail beside the cut's stamp centre, from an ungated run. */
interface TrailTick {
  tick: number
  cursorYMm: number
  waitingYMm: number[]
}

describe('casing at 84 m/s (ticket 560)', () => {
  const trail: TrailTick[] = []
  let run: SlabRun
  beforeAll(() => {
    const onTick = (state: AuthorityState, tick: number) => {
      const vehicle = vehicleOf(state, CUTTING_PLAYER)
      const cursorYMm = vehicle.sweptCut?.yMm ?? Number.NaN
      trail.push({ tick, cursorYMm, waitingYMm: vehicle.casingTrail.unlined.map((p) => p.yMm) })
    }
    // No gate: the trail resuming after a hold is the gate's business, not the speed's.
    run = withRegistrations([], () => cutSpeedSlab(slabRigOf(strideOfSpeed(84)), { onTick }))
  })

  // The 12-tick report re-anchors the trail at its own stamp, behind the swept front, so one gap
  // a report may run long (612 mm here; 600 at 18 m/s and 912 at 42, so not by speed): a finding
  // for the casing trail on ticket 560, not a speed bar. No two points ever stand closer.
  it('keeps every waiting ring point at least 500 mm from the next', () => {
    for (const { waitingYMm } of trail) {
      const gaps = waitingYMm.slice(1).map((yMm, at) => waitingYMm[at] - yMm)
      expect(gaps.filter((gap) => gap < CASING_RING_SPACING_MM)).toEqual([])
    }
  })

  it('lays a ring only once the stamp is the full lag past it, and never leaves one overdue', () => {
    trail.slice(1).forEach(({ cursorYMm, waitingYMm }, at) => {
      const laid = trail[at].waitingYMm.filter((yMm) => !waitingYMm.includes(yMm))
      expect(laid.filter((yMm) => yMm - cursorYMm < CASING_RING_LAG_MM)).toEqual([])
      expect(waitingYMm.filter((yMm) => yMm - cursorYMm >= CASING_RING_LAG_MM)).toEqual([])
    })
  })

  it('lays a ring for every 500 mm of its cut, and never cuts its own lining', () => {
    const rings = run.events.filter((event) => event.type === 'CasingPlaced').length
    const waiting = vehicleOf(run.end, CUTTING_PLAYER).casingTrail.unlined.length
    const cutMm = trail[0].cursorYMm - run.cutFootYMm
    expect(Math.abs(rings + waiting - cutMm / CASING_RING_SPACING_MM)).toBeLessThanOrEqual(1)
    expect(run.events.filter((event) => event.type === 'CasingDrilled')).toEqual([])
  })
})

/** Planet 1's chunk cache taken by another planet, so the next read generates from cold. */
function evictPlanetOne(): void {
  generatedChunkOf(planetParamsFor(WORLD_SEED, 2), 0, 0)
}

/** Every chunk round the bore, generated before the cut. */
function prefetchTheBore(): void {
  const lowest = chunkOfTile(SLAB_TILES.foot.ty - 70)
  for (let cy = lowest; cy <= chunkOfTile(SLAB_TILES.firstOre.ty + 8); cy++) {
    for (let cx = chunkOfTile(COLUMN - 3); cx <= chunkOfTile(COLUMN + 3); cx++) {
      generatedChunkOf(PARAMS, cx, cy)
    }
  }
}

const isFootChunkHeld = () =>
  isGeneratedChunkHeld(PARAMS, chunkOfTile(COLUMN), chunkOfTile(SLAB_TILES.foot.ty))

// HS on #551: generation is a pure function of the planet and the cell, so a chunk generated late
// can only cost time; the rig waits for it (the authority generates it on the read) and never
// carves it empty.
describe('a cold and a prefetched slab (ticket 560)', () => {
  it('cut the same cells into the same ground at 84 m/s', () => {
    const rig = slabRigOf(strideOfSpeed(84))
    const cold = withRegistrations([SLAB_GATE], () => {
      evictPlanetOne()
      expect(isFootChunkHeld()).toBe(false)
      return cutSpeedSlab(rig)
    })
    const prefetched = withRegistrations([SLAB_GATE], () => {
      prefetchTheBore()
      expect(isFootChunkHeld()).toBe(true)
      return cutSpeedSlab(rig)
    })
    expect(destroyedOf(cold)).toEqual(destroyedOf(prefetched))
    expect(cold.end.world).toEqual(prefetched.end.world)
    expect(stateDigest(cold.end)).toBe(stateDigest(prefetched.end))
  })
})
