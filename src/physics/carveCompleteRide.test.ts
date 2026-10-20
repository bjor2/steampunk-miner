import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { listenForCarvedCells } from '../store/carveCompleteBroadcast'
import { listenForDomainEvents } from '../store/domainEventBroadcast'
import { resetGameStore } from '../store/gameStore'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { buildIntent } from '../systems/input/buildIntent'
import { cellDensitySum } from '../systems/world/cellYield'
import type { TilePoint } from '../systems/world/tileGrid'
import { createRig } from './cutFollowFixtures'

// The carve-complete hook on the shipped swept cut (ticket 615, the G&V bar on #442): a rig drills
// straight down on planet 1 through the live loop and the game store, and every cell its drill
// yields is re-summed after each tick, apart from the hook. The hook fires for each cell once,
// never before the tick its density last fell, and at most one tick after it: the cell on the
// cut's line the tick its last sample goes, a cell beside it the tick after the front passed.
// Down legs at drill purchases 1, 10 and 20 (1.5, 10.7 and 94 m/s), at 30 and 144 frames/s,
// judged while the cut runs: from the first tick the gate shuts the drill has stopped, and a cell
// it stopped inside is the hook's still rule, not the front's.

const HOLD_NEVER_FULL = 60
const LEG_TICKS = 90
/** A cell still falling this near the leg's end may finish after it: it is not judged. */
const END_SLACK_TICKS = 2

const LEGS = [1, 10, 20].flatMap((purchase) =>
  [30, 144].map((framesPerSecond) => ({ purchase, framesPerSecond })),
)

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  const sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'carve-ride', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

interface WatchedCell {
  tile: TilePoint
  /** The last tick its density sum fell, read after every tick from its yield on. */
  lastFallTick: number
  lastSum: number | null
  carvedTicks: number[]
}

interface RiddenLeg {
  cells: WatchedCell[]
  /** The first tick the gate was not open, or the leg's end. */
  cutEndTick: number | null
}

const keyOf = ({ tx, ty }: TilePoint) => `${tx},${ty}`

function rideDown({ purchase, framesPerSecond }: (typeof LEGS)[number]): RiddenLeg {
  const levels = { drill_power: purchase, cargo_hold: HOLD_NEVER_FULL }
  const rig = createRig(RAPIER, levels, framesPerSecond)
  rig.hold(buildIntent(['aim_left']), 50)
  rig.hold(buildIntent([]), 90)
  const cells = new Map<string, WatchedCell>()
  const stops = [
    listenForDomainEvents((events, playerId) => watchDrilledCells(cells, events, playerId)),
    listenForCarvedCells((carved) =>
      carved.forEach((cell) => cells.get(keyOf(cell.tile))?.carvedTicks.push(cell.tick)),
    ),
  ]
  const leg: RiddenLeg = { cells: [], cutEndTick: null }
  rig.hold(buildIntent(['aim_down']), LEG_TICKS, (read) => {
    if (leg.cutEndTick !== null) return
    if (read.authorityGate === 1) cells.forEach(readFall)
    else if (cells.size > 0) leg.cutEndTick = readAuthorityState().tick
  })
  stops.forEach((stop) => stop())
  return { cells: [...cells.values()], cutEndTick: leg.cutEndTick ?? readAuthorityState().tick }
}

function watchDrilledCells(
  cells: Map<string, WatchedCell>,
  events: readonly DomainEvent[],
  playerId: string,
): void {
  for (const event of events) {
    if (event.type !== 'TileDestroyed' || event.cause !== undefined) continue
    if (event.playerId !== playerId) continue
    const tile = { tx: event.tx, ty: event.ty }
    cells.set(keyOf(tile), { tile, lastFallTick: event.tick, lastSum: null, carvedTicks: [] })
  }
}

function readFall(cell: WatchedCell): void {
  const state = readAuthorityState()
  const sum = cellDensitySum(state.world, planetParamsOf(state.planet)!, cell.tile)
  if (cell.lastSum !== null && sum < cell.lastSum) cell.lastFallTick = state.tick
  cell.lastSum = sum
}

function judgedCellsOf(leg: RiddenLeg): WatchedCell[] {
  const endTick = leg.cutEndTick ?? 0
  return leg.cells.filter((cell) => cell.lastFallTick < endTick - END_SLACK_TICKS)
}

const ROW = 'purchase $purchase at $framesPerSecond frames/s'

describe('carve complete on the swept cut (ticket 615)', () => {
  it.each(LEGS)(
    `finishes each drilled cell once, at most a tick after it last fell, ${ROW}`,
    (leg) => {
      const judged = judgedCellsOf(rideDown(leg))
      expect(judged.length).toBeGreaterThan(0)
      const late = judged.filter(
        (cell) =>
          cell.carvedTicks.length !== 1 ||
          cell.carvedTicks[0] < cell.lastFallTick ||
          cell.carvedTicks[0] > cell.lastFallTick + 1,
      )
      expect(late.map((cell) => [keyOf(cell.tile), cell.lastFallTick, cell.carvedTicks])).toEqual(
        [],
      )
    },
  )
})
