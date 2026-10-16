import { describe, expect, it } from 'vitest'
import { vehicleOf, type AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { EPIC_LEAD, withOreLeadAt } from '../../systems/authority/leadOreFixtures'
import { continueScriptedSession, PARAMS } from '../../systems/authority/scriptedSession'
import { oreSalePrice } from '../../systems/economy/oreEconomy'
import { onCurveSteps } from '../../systems/economy/vehicleStats'
import { add, fromCanonical, toCanonical, ZERO_MONEY } from '../../systems/money'
import { setUpgradeCommand } from '../../systems/vehicle/vehicleCommands'
import { statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { rarityTripCapAt, rarityTripOf, withRarityTrip } from '../ores'
import {
  ACT_TICK,
  drainSessionAt,
  oreTilesAround,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from './drainTestSession'

// The ores slice's trip clamp on the mineral drain route (ticket 509, TD ruling 6221725921 on #445
// section 6: one test per route). The ore in the drain's reach is made epic finds of its band, and
// a planet-10 hold leaves the drain's own 15% income cap room for them, so a fresh rarity trip
// pays them in full and a spent one pays each at its band's ore. The two caps stack apart.

const ORIGIN = standingTileWithOre(5)
const BIG_HOLD_PLANET = 10

function drainedEpics(isTripSpent: boolean) {
  const session = drainSessionAt(ORIGIN)
  session.submit(2, setUpgradeCommand('cargo_hold', onCurveSteps(BIG_HOLD_PLANET).cargo_hold))
  const epic = withOreLeadAt(session.state(), PARAMS, oreTilesAround(ORIGIN), EPIC_LEAD)
  const drained = continueScriptedSession(isTripSpent ? withTripPastEveryCap(epic) : epic)
  drained.submit(PRESS_TICK, press())
  drained.advanceTo(ACT_TICK + 4)
  return { state: drained.state(), added: cargoAddedOf(drained.events()) }
}

function withTripPastEveryCap(state: AuthorityState): AuthorityState {
  const capacity = statsOfVehicle(vehicleOf(state, 'p1')).cargoCapacity
  return withRarityTrip(state, 'p1', { clampedValue: rarityTripCapAt(1, 5, capacity) })
}

const cargoAddedOf = (events: readonly DomainEvent[]) =>
  events.filter(
    (event): event is Extract<DomainEvent, { type: 'CargoAdded' }> => event.type === 'CargoAdded',
  )

describe('extraction: the rarity trip clamp on the mineral drain', () => {
  it('pays a fresh trip its drained epic finds in full and counts them on the trip', () => {
    const { state, added } = drainedEpics(false)
    const fullValues = added.map((event) => toCanonical(oreSalePrice(event.resourceTier)))
    expect(added.length).toBeGreaterThan(0)
    expect(added.map((event) => event.value)).toEqual(fullValues)
    expect(rarityTripOf(state, 'p1').clampedValue).toEqual(
      fullValues.reduce((total, value) => add(total, fromCanonical(value)), ZERO_MONEY),
    )
  })

  it("pays a spent trip's drained epic finds at their band ore", () => {
    const { state, added } = drainedEpics(true)
    expect(added.length).toBeGreaterThan(0)
    expect(added.map((event) => event.value)).toEqual(
      added.map((event) => toCanonical(oreSalePrice(event.resourceTier - EPIC_LEAD))),
    )
    expect(rarityTripOf(state, 'p1')).toEqual(rarityTripOf(withTripPastEveryCap(state), 'p1'))
  })
})
