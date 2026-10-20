import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import type { TilePoint } from '../world/tileGrid'
import {
  EMPTY_CARVE_WATCH,
  followCarves,
  withoutCarvingPickups,
  yieldEventsOf,
  type CarveBatch,
  type CarveWatch,
} from './carveWatch'

const PLAYER = 'p1'
const TILE = { tx: 5, ty: 7 }
const HALF = 16 * 128

function destroyed(tile: TilePoint, tick: number, cause?: 'blast'): DomainEvent {
  return { type: 'TileDestroyed', ...tile, kind: 'ore', tick, playerId: PLAYER, seq: 1, cause }
}

function added(tick: number): DomainEvent {
  return {
    type: 'CargoAdded',
    resourceTier: 1,
    amount: 1,
    value: '10',
    oreId: 'copper_t1',
    depthTiles: 3,
    chunk: '0,0',
    tick,
    playerId: PLAYER,
    seq: 1,
  }
}

const EDIT = {
  type: 'GroundChanged',
  cx: 3,
  cy: 0,
  x0: 0,
  y0: 0,
  x1: 4,
  y1: 4,
  version: 1,
} as const

/** The player's cut edited the ground (any chunk) in this batch. */
function groundChanged(tick: number): DomainEvent {
  return { ...EDIT, tick, playerId: PLAYER, seq: 2 }
}

/** A tick-driven edit, a collapse's refill: no command caused it. */
function refilled(tick: number): DomainEvent {
  return { ...EDIT, tick }
}

function batchOf(tick: number, events: DomainEvent[], sum: number): CarveBatch {
  return { events, tick, planetIndex: 1, playerId: PLAYER, densitySumOf: () => sum }
}

/** Yields the cell at tick 10 with `sum` left, then follows each `[tick, sum, events]`. */
function carveFrom(sum: number, later: [number, number, DomainEvent[]][]) {
  let turn = followCarves(EMPTY_CARVE_WATCH, batchOf(10, [destroyed(TILE, 10), added(10)], sum))
  const carvedAt: number[] = turn.carved.map((cell) => cell.tick)
  for (const [tick, nowSum, events] of later) {
    turn = followCarves(turn.watch, batchOf(tick, events, nowSum))
    carvedAt.push(...turn.carved.map((cell) => cell.tick))
  }
  return { carvedAt, watch: turn.watch }
}

describe('carve watch', () => {
  it('finishes a cell in its yield batch when the carve left no density', () => {
    const turn = followCarves(EMPTY_CARVE_WATCH, batchOf(10, [destroyed(TILE, 10), added(10)], 0))
    expect(turn.carved.map((cell) => cell.tick)).toEqual([10])
    expect(yieldEventsOf(turn.carved).map((event) => event.type)).toEqual([
      'TileDestroyed',
      'CargoAdded',
    ])
  })

  it('waits while the front still lowers the cell, then finishes it the tick its last sample goes', () => {
    const { carvedAt } = carveFrom(HALF, [
      [11, HALF - 300, [groundChanged(11)]],
      [12, 400, [groundChanged(12)]],
      [13, 0, [groundChanged(13)]],
    ])
    expect(carvedAt).toEqual([13])
  })

  it('finishes a wall cell the tick the player’s cut edits the ground and leaves it standing', () => {
    const { carvedAt } = carveFrom(HALF, [
      [11, 900, [groundChanged(11)]],
      [12, 900, [groundChanged(12)]],
    ])
    expect(carvedAt).toEqual([12])
  })

  it('waits on a tick-driven edit, which lands before the tick’s cut', () => {
    const { carvedAt } = carveFrom(HALF, [
      [11, 900, [groundChanged(11)]],
      [12, 900, [refilled(12)]],
    ])
    expect(carvedAt).toEqual([])
  })

  it('never judges a cell twice in the tick it last fell', () => {
    const { carvedAt } = carveFrom(HALF, [
      [11, 900, [groundChanged(11)]],
      [11, 900, [groundChanged(11)]],
    ])
    expect(carvedAt).toEqual([])
  })

  it('finishes a cell the drill stopped inside two ticks after it last fell', () => {
    const { carvedAt } = carveFrom(HALF, [
      [11, 900, []],
      [12, 900, []],
      [13, 900, []],
    ])
    expect(carvedAt).toEqual([13])
  })

  it('lets go of the last planet’s cells on a new planet', () => {
    const { watch } = carveFrom(HALF, [])
    const turn = followCarves(watch, { ...batchOf(11, [], HALF), planetIndex: 2 })
    expect(turn.watch.carving).toEqual([])
    expect(turn.carved).toEqual([])
  })

  it('watches only the drill’s cells, never a blast’s', () => {
    const blast = [destroyed(TILE, 10, 'blast'), added(10)]
    expect(followCarves(EMPTY_CARVE_WATCH, batchOf(10, blast, 0)).carved).toEqual([])
  })

  it('finishes cells in walk order, the earlier yields first', () => {
    const second = { tx: 6, ty: 7 }
    const watch: CarveWatch = followCarves(
      EMPTY_CARVE_WATCH,
      batchOf(10, [destroyed(TILE, 10)], HALF),
    ).watch
    const turn = followCarves(watch, batchOf(11, [destroyed(second, 11)], 0))
    expect(turn.carved.map((cell) => cell.tile)).toEqual([TILE, second])
  })
})

describe('carving pickups', () => {
  it('holds back only the units the drill’s cells paid, keeping a blast’s', () => {
    const events = [destroyed(TILE, 10), added(10), destroyed(TILE, 10, 'blast'), added(10)]
    const kept = withoutCarvingPickups(events, PLAYER)
    expect(kept.map((event) => event.type)).toEqual([
      'TileDestroyed',
      'TileDestroyed',
      'CargoAdded',
    ])
  })
})
