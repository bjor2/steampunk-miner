import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../systems/fastForward'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import type { CarvedCell } from '../systems/materialPop/carveWatch'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { FACING } from '../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../systems/world/cellYield'
import { planetParamsFor } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityState } from './authorityLink'
import { listenForCarvedCells } from './carveCompleteBroadcast'
import { listenForDomainEvents } from './domainEventBroadcast'
import { listenForFeedback } from './feedbackBroadcast'
import { readAuthorityTick, resetGameStore, useGameStore } from './gameStore'

// The carve hook as the game store follows it: a surface ore cell drilled in two goes, the first
// stopping past its yield (half its density gone) and the second cutting the rest away.

const game = () => useGameStore.getState()
const PLANET_1 = planetParamsFor(1, 1)
const TILE = surfaceOreTiles(1, PLANET_1)[0]

let carved: CarvedCell[] = []
let cues: FeedbackCue[] = []
let heard: DomainEvent[] = []
let stops: (() => void)[] = []

beforeEach(() => {
  resetGameStore()
  carved = []
  cues = []
  heard = []
  stops = [
    listenForDomainEvents((events) => heard.push(...events)),
    listenForCarvedCells((cells) => carved.push(...cells)),
    listenForFeedback((cue) => cues.push(cue)),
  ]
  if (game().vehicle.mode === 'docked') game().undock()
})

afterEach(() => stops.forEach((stop) => stop()))

function poseOver(tile: TilePoint, tick: number): ScriptedCommand {
  const payload = {
    x: tile.tx * 1000 + 500,
    y: (tile.ty + 1) * 1000 + 500,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
    driving: false,
    thrusting: false,
    drilling: false,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: 0,
    drive: NO_DRIVE,
  }
  return { tick, type: 'reportPose', payload }
}

function standOverTile(): void {
  const start = readAuthorityTick() + 1
  game().fastForward(1, [poseOver(TILE, start)])
}

/** Drills the tile one tick at a time, as the fixed step does, for `ticks` ticks. */
function drillFor(ticks: number): void {
  for (let step = 0; step < ticks; step++) {
    const tick = readAuthorityTick() + 1
    game().fastForward(1, [{ tick, type: 'drillTile', payload: { ...TILE, ticks: 1 } }])
  }
}

function densitySum(): number {
  return cellDensitySum(readAuthorityState().world, PLANET_1, TILE)
}

/** Drills one tick at a time until the tile's unit has reached the hold. */
function drillUntilYield(): void {
  while (!heard.some((event) => event.type === 'CargoAdded')) drillFor(1)
}

describe('carve complete hook', () => {
  it('finishes a drilled cell the tick its last sample is cut, not the tick it pays', () => {
    standOverTile()
    drillUntilYield()
    expect(densitySum()).toBeGreaterThan(0)
    expect(carved).toEqual([])
    while (densitySum() > 0) drillFor(1)
    expect(carved.map((cell) => [cell.tile, cell.tick])).toEqual([[TILE, readAuthorityTick()]])
  })

  it('sounds the drilled unit’s pickup once, when its cell is carved', () => {
    standOverTile()
    drillUntilYield()
    expect(cues.filter((cue) => cue.kind === 'pickup')).toEqual([])
    while (densitySum() > 0) drillFor(1)
    expect(cues.filter((cue) => cue.kind === 'pickup')).toHaveLength(1)
  })

  it('carries the cell’s yield events to its listeners, its unit with them', () => {
    standOverTile()
    drillFor(60)
    expect(carved.flatMap((cell) => cell.yieldEvents.map((event) => event.type))).toEqual([
      'TileDestroyed',
      'CargoAdded',
    ])
  })
})
