import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { fromCanonical, toFixedText } from '../systems/money'
import { FACING } from '../systems/vehicle/vehiclePose'
import { statsOfVehicle, type VehicleMode } from '../systems/vehicle/vehicleState'
import { freshPlanetParamsFor } from '../systems/world/planetParams'
import { surfaceRowOfColumn } from '../systems/world/tileGrid'
import { TRIP_END_CAUSES } from './tripEndCause'
import { emptyTripFold, foldTripStep, type TripFold } from './tripFold'

const PLAYER = 'p1'
const SEED = 83921

interface Rig {
  depthTiles?: number
  mode?: VehicleMode
  energy?: number
  hull?: string
  cargoUnits?: bigint
}

describe('per-trip fold (ticket 918)', () => {
  it('ends a scripted run in each of the six causes once, every field filled in', () => {
    const fold = emptyTripFold()
    playScriptedRun(fold)

    expect(fold.trips.map((trip) => trip.endCause)).toEqual([
      'voluntary_sell',
      'hold_full',
      'fuel',
      'hull',
      'death',
      'cache_crate',
    ])
    expect([...TRIP_END_CAUSES].sort()).toEqual(fold.trips.map((t) => t.endCause).sort())
    fold.trips.forEach((trip) => {
      expect(trip.endTick).toBeGreaterThan(trip.startTick)
      expect(trip.deepestBand).toBeGreaterThanOrEqual(1)
      expect(trip.cellsCut).toBeGreaterThan(0)
      expect(trip.fuelUsedQuanta).toBeGreaterThan(0)
    })
  })

  it('times a trip from its first step off the pad to the dock that ends it', () => {
    const fold = emptyTripFold()
    step(fold, 0, { mode: 'docked' })
    step(fold, 100, {}, [left()])
    step(fold, 200, { depthTiles: 3 }, [broke(3)])
    step(fold, 400, { mode: 'docked' }, [docked(1n)])

    expect(fold.trips[0]).toMatchObject({ planet: 1, startTick: 100, endTick: 400 })
  })

  it('gives a trip the deepest band it cut or stood in, and counts every cell it cut', () => {
    const fold = emptyTripFold()
    step(fold, 0, {})
    step(fold, 100, { depthTiles: 3 }, [broke(3), broke(4)])
    step(fold, 200, { depthTiles: deepDepthTiles() }, [])
    step(fold, 300, { mode: 'docked' }, [docked(2n)])

    expect(fold.trips[0].cellsCut).toBe(2)
    expect(fold.trips[0].deepestBand).toBeGreaterThan(1)
  })

  it('credits a trip with the sales after its dock until the next trip ends', () => {
    const fold = emptyTripFold()
    tripTo(fold, 0, {}, [docked(1n)])
    step(fold, 210, { mode: 'docked' }, [sold('70')])
    step(fold, 220, { mode: 'docked' }, [sold('5')])

    expect(toFixedText(fold.trips[0].sellValue, 0)).toBe('75')
  })

  it('sums every drop of the tank on the trip as the fuel it used', () => {
    const fold = emptyTripFold()
    step(fold, 0, { energy: 1000 })
    step(fold, 100, { depthTiles: 3, energy: 700 }, [broke(3)])
    step(fold, 150, { depthTiles: 3, energy: 900 }, [])
    step(fold, 200, { energy: 850 }, [])
    step(fold, 300, { mode: 'docked', energy: 850 }, [docked(1n)])

    expect(fold.trips[0].fuelUsedQuanta).toBe(350)
  })

  it('makes no trip of a bay hop that cut nothing and brought nothing home', () => {
    const fold = emptyTripFold()
    step(fold, 0, {})
    step(fold, 50, { mode: 'docked' }, [docked(0n)])

    expect(fold.trips).toEqual([])
  })

  it('starts the next trip where a crate took the hold, and the crate trip sells nothing', () => {
    const fold = emptyTripFold()
    step(fold, 0, {})
    step(fold, 100, { depthTiles: 3, cargoUnits: 4n }, [broke(3)])
    step(fold, 150, { depthTiles: 3, cargoUnits: 0n }, [])
    step(fold, 200, { depthTiles: 3, cargoUnits: 1n }, [broke(3)])
    step(fold, 300, { mode: 'docked', cargoUnits: 1n }, [docked(1n)])
    step(fold, 310, { mode: 'docked' }, [sold('40')])

    const [crate, home] = fold.trips
    expect(crate).toMatchObject({ endCause: 'cache_crate', endTick: 150 })
    expect(home).toMatchObject({ endCause: 'voluntary_sell', startTick: 150 })
    expect(toFixedText(crate.sellValue, 0)).toBe('0')
    expect(toFixedText(home.sellValue, 0)).toBe('40')
  })

  it('reads fuel and hull at the turn-back, not on the climb home', () => {
    const fold = emptyTripFold()
    step(fold, 0, {})
    step(fold, 100, { depthTiles: 5 }, [broke(5)])
    step(fold, 200, { depthTiles: 2, energy: 0, hull: '1' }, [])
    step(fold, 300, { mode: 'docked', energy: 0, hull: '1' }, [docked(1n)])

    expect(fold.trips[0].endCause).toBe('voluntary_sell')
  })

  it('skips a debug step whole, so a scenario set-up starts no trip', () => {
    const fold = emptyTripFold()
    step(fold, 0, {}, [setUp()])

    expect(fold.open).toBeNull()
  })
})

/** Six trips, each ending in a different cause. */
function playScriptedRun(fold: TripFold): void {
  tripTo(fold, 0, {}, [docked(1n)])
  tripTo(fold, 1000, {}, [docked(capacity())])
  tripTo(fold, 2000, { energy: 0 }, [docked(1n)])
  tripTo(fold, 3000, { hull: '1' }, [docked(1n)])
  tripTo(fold, 4000, {}, [destroyed(), rescued()])
  tripTo(fold, 5000, { cargoUnits: 3n }, [])
  step(fold, 5300, { depthTiles: 3, cargoUnits: 0n }, [])
}

/** Off the pad at `tick`, cuts a cell three tiles down, turns back there as `turnBack` reads, ends. */
function tripTo(fold: TripFold, tick: number, turnBack: Rig, ending: DomainEventBody[]): void {
  step(fold, tick, { energy: 30000 }, [left()])
  step(fold, tick + 100, { depthTiles: 3, energy: 25000 }, [broke(3)])
  step(fold, tick + 150, { depthTiles: 3, energy: 24000, ...turnBack }, [])
  if (ending.length > 0) step(fold, tick + 200, { mode: 'docked' }, ending)
}

function step(fold: TripFold, tick: number, rig: Rig, bodies: DomainEventBody[] = []): void {
  const events = bodies.map((body) => ({ tick, ...body }) as DomainEvent)
  foldTripStep(fold, stateAt(tick, rig), PLAYER, events)
}

/** A one-player session on planet 1 at `tick`, its vehicle as `rig` says below column 0's surface. */
function stateAt(tick: number, rig: Rig): AuthorityState {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: [PLAYER] })
  const player = start.players[PLAYER]
  const { radiusTiles } = freshPlanetParamsFor(SEED, 1)
  const row = surfaceRowOfColumn(0, radiusTiles) - (rig.depthTiles ?? 0)
  const pose = { x: 500, y: row * 1000 + 500, vx: 0, vy: 0, upx: 0, upy: 1, facing: FACING.down }
  const vehicle = {
    ...player.vehicle,
    pose,
    mode: rig.mode ?? 'active',
    energy: rig.energy ?? player.vehicle.energy,
    hull: rig.hull === undefined ? player.vehicle.hull : fromCanonical(rig.hull),
    cargo: { ...player.vehicle.cargo, ore: { '1': rig.cargoUnits ?? 1n } },
  }
  return { ...start, tick, players: { [PLAYER]: { ...player, vehicle } } }
}

function capacity(): bigint {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: SEED, playerIds: [PLAYER] })
  return statsOfVehicle(start.players[PLAYER].vehicle).cargoCapacity
}

/** Halfway from the surface to the core: past band 1 on any planet. */
function deepDepthTiles(): number {
  const { radiusTiles, coreRadiusTiles } = freshPlanetParamsFor(SEED, 1)
  return Math.floor((radiusTiles - coreRadiusTiles) / 2)
}

function setUp(): DomainEventBody {
  return { type: 'DebugCommandApplied', command: 'debug.setMoney', args: {} }
}

function left(): DomainEventBody {
  return { type: 'DockLeft', bay: 'sell', durationTicks: 0 }
}

function sold(value: string): DomainEventBody {
  return { type: 'ResourceSold', items: [], value, mode: 'all', coinsShown: 0 }
}

/** The cell `depthTiles` below column 0's surface on planet 1 broke. */
function broke(depthTiles: number): DomainEventBody {
  const { radiusTiles } = freshPlanetParamsFor(SEED, 1)
  const ty = surfaceRowOfColumn(0, radiusTiles) - depthTiles
  return { type: 'TileDestroyed', tx: 0, ty, kind: 'ore' }
}

function docked(cargoUnits: bigint): DomainEventBody {
  return { type: 'DockEntered', bay: 'sell', cargoUnits, energy: 0, hull: '0' }
}

function destroyed(): DomainEventBody {
  return { type: 'VehicleDestroyed', cause: 'enemy', attacker: null }
}

function rescued(): DomainEventBody {
  return { type: 'RescueTriggered', cause: 'destroyed', fee: '0', cargoLostValue: '0' }
}
