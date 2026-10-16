import { describe, expect, it } from 'vitest'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { poseOnTile } from '../../../systems/authority/charges/chargeFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { EPIC_LEAD } from '../../../systems/authority/leadOreFixtures'
import { continueScriptedSession, FREEZE_ENEMIES } from '../../../systems/authority/scriptedSession'
import { oreSalePrice, oreTier } from '../../../systems/economy/oreEconomy'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import { toCanonical } from '../../../systems/money'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { swapTileCells } from '../../../systems/world/terrainCellEdits'
import { rarityTripCapAt, rarityTripOf, withRarityTrip } from '../../ores'
import { touch } from './extractorFixtures'
import { gatedCellOn, grantItems, paramsOn, sessionOn } from './gateFixtures'
import { VERB_ROWS } from './verbRows'

// The ores slice's trip clamp on the gate-pull route (ticket 509, TD ruling 6221725921 on #445
// section 6: one test per route). On planet 26 the induction coil gates the band-3 epic of the
// planet's mix; that cell stands beside the vehicle, so a fresh trip is paid it in full when the
// coil pulls it and a spent one is paid the band's own ore.

const PLANET = 26
const COIL = 'rig.induction'
const { pull } = VERB_ROWS

function pulledEpic(isTripSpent: boolean) {
  const session = sessionOn(PLANET)
  const params = paramsOn(session)
  const coilEpic = gatedCellOn(
    params,
    (gated, band) =>
      gated.gate.kind === 'rig' &&
      gated.gate.rig.id === COIL &&
      gated.entry.tier - oreTier(PLANET, band) === EPIC_LEAD,
  )
  const steps = onCurveSteps(PLANET)
  session.submit(0, FREEZE_ENEMIES)
  for (const upgradeId of ['drill_power', 'drill_tip', 'cargo_hold'] as const) {
    session.submit(0, setUpgradeCommand(upgradeId, steps[upgradeId]))
  }
  grantItems(session, [COIL])
  session.submit(0, poseOnTile({ tx: coilEpic.tile.tx - 1, ty: coilEpic.tile.ty }))
  const placed = swapTileCells(session.state().world, [{ ...coilEpic.tile, cell: coilEpic.cell }])
  const epic = { ...session.state(), world: placed.world }
  const pulled = continueScriptedSession(isTripSpent ? withTripPastEveryCap(epic) : epic)
  touch(pulled, coilEpic.tile, 10)
  pulled.advanceTo(10 + pull.pullTicks + 2)
  return { state: pulled.state(), added: cargoAddedOf(pulled.events()), band: coilEpic.band }
}

function withTripPastEveryCap(state: AuthorityState): AuthorityState {
  const capacity = statsOfVehicle(vehicleOf(state, 'p1')).cargoCapacity
  return withRarityTrip(state, 'p1', { clampedValue: rarityTripCapAt(PLANET, 5, capacity) })
}

const cargoAddedOf = (events: readonly DomainEvent[]) =>
  events.filter(
    (event): event is Extract<DomainEvent, { type: 'CargoAdded' }> => event.type === 'CargoAdded',
  )

describe('mining-gates: the rarity trip clamp on the coil pull', () => {
  it('pays a fresh trip the pulled epic find in full and counts it on the trip', () => {
    const { state, added } = pulledEpic(false)
    const [unit] = added
    expect(added).toHaveLength(1)
    expect(unit.value).toBe(toCanonical(oreSalePrice(unit.resourceTier)))
    expect(rarityTripOf(state, 'p1').clampedValue).toEqual(oreSalePrice(unit.resourceTier))
  })

  it("pays a spent trip the pulled epic find at its band's ore", () => {
    const { state, added, band } = pulledEpic(true)
    expect(added.map((event) => event.value)).toEqual([
      toCanonical(oreSalePrice(oreTier(PLANET, band))),
    ])
    expect(rarityTripOf(state, 'p1')).toEqual(rarityTripOf(withTripPastEveryCap(state), 'p1'))
  })
})
