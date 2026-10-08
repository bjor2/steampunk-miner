import { describe, expect, it } from 'vitest'
import { FIRE_EAST, ORE_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { minedOreOf } from '../../../systems/authority/minedOre'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../../../systems/money'
import { withSection } from '../../../systems/registries/saveSections'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { cargoUnitsOf, statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { EXTRACTION_TRIP_SECTION, incomeTripOf, tripCapAt } from '../../extraction'
import { BORE_PICKUP_REACTION, boredOreTilesOf } from './borePickup'
import { wallLevelOf } from './gunTracks'

const FIRE_TICK = 10
const END_TICK = FIRE_TICK + 20
/** The third and fourth cells east of `ORE_RIG` hold ore (the kernel fixture); a heard bore of both. */
const ORE_TILES: TilePoint[] = [3, 4].map((step) => ({ tx: ORE_RIG.tx + step, ty: ORE_RIG.ty }))
/** A planet-10 drill: the whole four-cell line opens inside the 90-tick shot budget. */
const STRONG_DRILL_PLANET = 10

const gunAtItsWalls: CommandIntent = {
  type: 'debug.ground-gun.setLevels',
  payload: {
    rate: wallLevelOf('rate'),
    penetration: wallLevelOf('penetration'),
    energy: wallLevelOf('energy'),
  },
}

/** A planet-1 rig with the gun at its walls, a strong drill and a big hold, in its rock pocket. */
function armedRig(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, gunAtItsWalls)
  const steps = onCurveSteps(STRONG_DRILL_PLANET)
  session.submit(0, setUpgradeCommand('drill_power', steps.drill_power))
  session.submit(0, setUpgradeCommand('drill_tip', steps.drill_tip))
  // A hold whose trip cap (15% of it) has room for both units.
  session.submit(0, setUpgradeCommand('cargo_hold', steps.cargo_hold))
  standInPocket(session, ORE_RIG, 0)
  return session
}

const unitValueOf = (tile: TilePoint) =>
  oreSalePrice(minedOreOf(PARAMS, tile, cellAt(EMPTY_WORLD, PARAMS, tile)).saleTier)

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

/** The heard events of a bore opening the two ore cells, and the state before and after. */
function boreHeardOn(before: AuthorityState): readonly DomainEvent[] {
  return ORE_TILES.map(
    (tile) =>
      ({
        type: 'TileDestroyed',
        ...tile,
        kind: 'ore',
        cause: 'bore',
        playerId: 'p1',
        tick: before.tick,
        seq: 0,
      }) as DomainEvent,
  )
}

function tripValueOf(state: AuthorityState): string {
  return incomeTripOf(state, 'p1').incomeItemValue
}

describe('ground-gun: picking up the ore a bore frees', () => {
  it('pays each bored ore unit at the drilled price into the hold, once', () => {
    const session = armedRig()
    session.submit(FIRE_TICK, FIRE_EAST)
    session.advanceTo(END_TICK)
    const bored = boredOreTilesOf(session.events())
    const cargo = ofType(session.events(), 'CargoAdded')
    expect(bored.length).toBeGreaterThan(0)
    expect(cargo.map((event) => event.value)).toEqual(
      bored.map((tile) => toCanonical(unitValueOf(tile))),
    )
    expect(cargoUnitsOf(session.vehicle().cargo)).toBe(bored.length)
  })

  it("counts what it pays on the trip's shared income counter", () => {
    const session = armedRig()
    session.submit(FIRE_TICK, FIRE_EAST)
    session.advanceTo(END_TICK)
    const paid = boredOreTilesOf(session.events())
      .map(unitValueOf)
      .reduce((total, value) => add(total, value), ZERO_MONEY)
    expect(tripValueOf(session.state())).toBe(toCanonical(paid))
  })

  it('loses a unit the trip cap has no room for, paying nothing for it', () => {
    const session = armedRig()
    const state = session.state()
    const capacity = statsOfVehicle(session.vehicle()).cargoCapacity
    const cap = tripCapAt(1, bandOfTile(PARAMS, ORE_RIG.tx, ORE_RIG.ty), capacity)
    const roomForOne = sub(cap, unitValueOf(ORE_TILES[0]))
    const nearCap = withSection(state, 'p1', EXTRACTION_TRIP_SECTION, {
      ...incomeTripOf(state, 'p1'),
      incomeItemValue: toCanonical(roomForOne),
    })
    const effect = BORE_PICKUP_REACTION.react(nearCap, nearCap, boreHeardOn(nearCap))
    expect(effect.events.map((event) => event.type)).toEqual([
      'CargoAdded',
      'ground-gun.BoredOreCapped',
    ])
    expect(fromCanonical(tripValueOf(effect.state))).toEqual(cap)
  })

  it('hears only ore the bore opened: drilled and blasted cells are not its own', () => {
    const heard = [
      { type: 'TileDestroyed', tx: 1, ty: 1, kind: 'ore' },
      { type: 'TileDestroyed', tx: 2, ty: 1, kind: 'ore', cause: 'blast' },
      { type: 'TileDestroyed', tx: 3, ty: 1, kind: 'ground', cause: 'bore' },
      { type: 'TileDestroyed', tx: 4, ty: 1, kind: 'ore', cause: 'bore' },
    ] as DomainEvent[]
    expect(boredOreTilesOf(heard)).toEqual([{ tx: 4, ty: 1 }])
  })
})
