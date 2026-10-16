import { describe, expect, it } from 'vitest'
import { FIRE_EAST, ORE_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { EPIC_LEAD, withOreLeadAt } from '../../../systems/authority/leadOreFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  PARAMS,
} from '../../../systems/authority/scriptedSession'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import { add, fromCanonical, toCanonical, ZERO_MONEY } from '../../../systems/money'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { rarityTripCapAt, rarityTripOf, withRarityTrip } from '../../ores'
import { wallLevelOf } from './gunTracks'

// The ores slice's trip clamp on the bore pickup route (ticket 509, TD ruling 6221725921 on #445
// section 6: one test per route). The two ore cells of the bore fixture's line are made epic finds
// of their band, so a fresh trip pays them in full and a spent one pays each at its band's ore.

const FIRE_TICK = 10
const END_TICK = FIRE_TICK + 20
const ORE_TILES: TilePoint[] = [3, 4].map((step) => ({ tx: ORE_RIG.tx + step, ty: ORE_RIG.ty }))
/** A planet-10 drill and hold: the line opens in the shot budget, and the caps fit both units. */
const STRONG_PLANET = 10

const gunAtItsWalls: CommandIntent = {
  type: 'debug.ground-gun.setLevels',
  payload: {
    rate: wallLevelOf('rate'),
    penetration: wallLevelOf('penetration'),
    energy: wallLevelOf('energy'),
  },
}

function boredEpics(isTripSpent: boolean) {
  const session = createScriptedSession()
  session.submit(0, gunAtItsWalls)
  const steps = onCurveSteps(STRONG_PLANET)
  for (const upgradeId of ['drill_power', 'drill_tip', 'cargo_hold'] as const) {
    session.submit(0, setUpgradeCommand(upgradeId, steps[upgradeId]))
  }
  standInPocket(session, ORE_RIG, 0)
  const epic = withOreLeadAt(session.state(), PARAMS, ORE_TILES, EPIC_LEAD)
  const bored = continueScriptedSession(isTripSpent ? withTripPastEveryCap(epic) : epic)
  bored.submit(FIRE_TICK, FIRE_EAST)
  bored.advanceTo(END_TICK)
  return { state: bored.state(), added: cargoAddedOf(bored.events()) }
}

function withTripPastEveryCap(state: AuthorityState): AuthorityState {
  const capacity = statsOfVehicle(vehicleOf(state, 'p1')).cargoCapacity
  return withRarityTrip(state, 'p1', { clampedValue: rarityTripCapAt(1, 5, capacity) })
}

const cargoAddedOf = (events: readonly DomainEvent[]) =>
  events.filter(
    (event): event is Extract<DomainEvent, { type: 'CargoAdded' }> => event.type === 'CargoAdded',
  )

describe('ground-gun: the rarity trip clamp on the bore pickup', () => {
  it('pays a fresh trip its bored epic finds in full and counts them on the trip', () => {
    const { state, added } = boredEpics(false)
    const fullValues = added.map((event) => toCanonical(oreSalePrice(event.resourceTier)))
    expect(added).toHaveLength(ORE_TILES.length)
    expect(added.map((event) => event.value)).toEqual(fullValues)
    expect(rarityTripOf(state, 'p1').clampedValue).toEqual(
      fullValues.reduce((total, value) => add(total, fromCanonical(value)), ZERO_MONEY),
    )
  })

  it("pays a spent trip's bored epic finds at their band ore", () => {
    const { state, added } = boredEpics(true)
    expect(added).toHaveLength(ORE_TILES.length)
    expect(added.map((event) => event.value)).toEqual(
      added.map((event) => toCanonical(oreSalePrice(event.resourceTier - EPIC_LEAD))),
    )
    expect(rarityTripOf(state, 'p1')).toEqual(rarityTripOf(withTripPastEveryCap(state), 'p1'))
  })
})
