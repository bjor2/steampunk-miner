import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../store/authorityLink'
import { listenForCarvedCells } from '../store/carveCompleteBroadcast'
import { listenForDomainEvents } from '../store/domainEventBroadcast'
import { readAuthorityTick, resetGameStore, useGameStore } from '../store/gameStore'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import { stateDigest } from '../systems/authority/stateDigest'
import type { ScriptedCommand } from '../systems/fastForward'
import type { MaterialPopMode } from '../systems/materialPop/materialPopMode'
import { createSprayPool, isPopAt, type SprayPool } from '../systems/render/sprayPool'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { FACING } from '../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../systems/world/cellYield'
import { planetParamsFor } from '../systems/world/planetParams'
import { createScenePops, popCarvedCellsInModeB } from './materialPops'
import { sprayPresence } from './sprayPresence'

// Option B's pop as the spray layer takes it (ticket 616, VS condition 3 on #442): a surface ore
// cell drilled tick by tick pops on the tick the carve hook finishes it, in mode B only, and the
// hold, the codex, the first-ore events and the digest are the same with pops on and off.

const game = () => useGameStore.getState()
const PLANET_1 = planetParamsFor(1, 1)
const TILE = surfaceOreTiles(1, PLANET_1)[0]

let stops: (() => void)[] = []

beforeEach(() => {
  resetGameStore()
  if (game().vehicle.mode === 'docked') game().undock()
})

afterEach(() => stops.forEach((stop) => stop()))

function standOverTile(): void {
  const tick = readAuthorityTick() + 1
  const payload = {
    x: TILE.tx * 1000 + 500,
    y: (TILE.ty + 1) * 1000 + 500,
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
  const stand: ScriptedCommand = { tick, type: 'reportPose', payload }
  game().fastForward(1, [stand])
}

/** Drills the tile one tick at a time, as the fixed step does, until it is carved and 2 more. */
function drillTileAway(): void {
  let after = 2
  while (after > 0) {
    const tick = readAuthorityTick() + 1
    game().fastForward(1, [{ tick, type: 'drillTile', payload: { ...TILE, ticks: 1 } }])
    if (cellDensitySum(readAuthorityState().world, PLANET_1, TILE) === 0) after--
  }
}

function popsIn(pool: SprayPool): number {
  let pops = 0
  for (let at = 0; at < pool.particles.count; at++) if (isPopAt(pool, at)) pops++
  return pops
}

interface Drilled {
  digest: string
  cargo: unknown
  heard: string[]
  carvedTicks: number[]
  startedPops: number
  pool: SprayPool
}

function drillWithPops(mode: MaterialPopMode): Drilled {
  const pool = createSprayPool()
  const heard: DomainEvent[] = []
  const carvedTicks: number[] = []
  const startedBefore = sprayPresence.pops.started
  game().switchMaterialPopMode(mode, 'debugApi')
  stops = [
    popCarvedCellsInModeB(createScenePops(pool)),
    listenForDomainEvents((events) => heard.push(...events)),
    listenForCarvedCells((cells) => carvedTicks.push(...cells.map((cell) => cell.tick))),
  ]
  standOverTile()
  drillTileAway()
  return {
    digest: stateDigest(readAuthorityState()),
    cargo: readAuthorityState().vehicles,
    heard: heard.map((event) => event.type),
    carvedTicks,
    startedPops: sprayPresence.pops.started - startedBefore,
    pool,
  }
}

describe('material pops in the spray layer', () => {
  it('pops a drilled cell’s unit in mode B on the tick its carve finishes', () => {
    const drilled = drillWithPops('B')
    expect(drilled.carvedTicks).toHaveLength(1)
    expect(drilled.startedPops).toBe(1)
    expect(popsIn(drilled.pool)).toBe(1)
    expect(sprayPresence.pops.startLagTicksMost).toBe(0)
  })

  it('pops nothing in mode A', () => {
    const drilled = drillWithPops('A')
    expect(drilled.carvedTicks).toHaveLength(1)
    expect(drilled.startedPops).toBe(0)
    expect(drilled.pool.particles.count).toBe(0)
  })

  it('leaves the hold credit, codex, first-ore events and digest equal with pops off', () => {
    const withPops = drillWithPops('B')
    stops.forEach((stop) => stop())
    resetGameStore()
    if (game().vehicle.mode === 'docked') game().undock()
    const withoutPops = drillWithPops('A')
    expect(withPops.startedPops).toBe(1)
    expect(withPops.cargo).toEqual(withoutPops.cargo)
    expect(withPops.heard).toEqual(withoutPops.heard)
    expect(withPops.digest).toBe(withoutPops.digest)
  })
})
