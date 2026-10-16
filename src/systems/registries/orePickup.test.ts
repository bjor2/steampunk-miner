import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../authority/authorityState'
import { collectOreUnit } from '../authority/groundDrill'
import { minedOreOf, type MinedOre } from '../authority/minedOre'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { toCanonical } from '../money'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { planetParamsFor } from '../world/planetParams'
import { bandOfTile } from '../world/planetGeometry'
import { oreCell } from '../world/worldCell'
import type { PickupFind } from './orePickup'

// The ore pickup seam (ticket 509): `collectOreUnit` asks the one provider for the tier a unit is
// kept at once it has room; with none the unit keeps its own sale tier and the state its shape.

const PLANET = 3
const SEED = 83921

function startState(): AuthorityState {
  return createAuthorityState({ planetIndex: PLANET, planetSeed: SEED, playerIds: ['p1'] })
}

const EPIC_LEAD = 3

/** An ore cell near the core, three tiers above its band (an epic lead), as the drill mines it. */
function epicOre(): MinedOre {
  const params = planetParamsFor(SEED, PLANET)
  const tile = { tx: 0, ty: -Math.floor(params.coreRadiusTiles) - 2 }
  const band = bandOfTile(params, tile.tx, tile.ty)
  return minedOreOf(params, tile, oreCell(0, band - 1 + EPIC_LEAD))
}

function withFullHold(state: AuthorityState): AuthorityState {
  const vehicle = vehicleOf(state, 'p1')
  const capacity = statsOfVehicle(vehicle).cargoCapacity
  return withVehicle(state, 'p1', {
    ...vehicle,
    cargo: { ...vehicle.cargo, coreFragments: capacity },
  })
}

function recordingSlice(asked: PickupFind[], keptTier: number): SliceDefinition {
  return {
    id: 'probe',
    register: (r) =>
      r.orePickup({
        id: 'probe.pickup',
        pickupOf: (state, _playerId, find) => {
          asked.push(find)
          return { saleTier: keptTier, state: { ...state, tick: state.tick + 1 } }
        },
      }),
  }
}

describe('ore pickup seam', () => {
  it('keeps the unit at its own sale tier and the state untouched with no provider', () => {
    const ore = epicOre()
    const collected = withRegistrations([], () => collectOreUnit(startState(), 'p1', ore))
    expect(vehicleOf(collected.state, 'p1').cargo.ore).toEqual({ [String(ore.saleTier)]: 1 })
    expect(collected.events).toEqual([
      expect.objectContaining({
        type: 'CargoAdded',
        value: toCanonical(oreSalePrice(ore.saleTier)),
      }),
    ])
  })

  it('asks the provider with the band and the lead above it, and stores and prices its tier', () => {
    const asked: PickupFind[] = []
    const ore = epicOre()
    const kept = oreTier(PLANET, ore.band)
    const collected = withRegistrations([recordingSlice(asked, kept)], () =>
      collectOreUnit(startState(), 'p1', ore),
    )
    expect(asked).toEqual([
      { planetIndex: PLANET, band: ore.band, tierAboveBand: EPIC_LEAD, saleTier: ore.saleTier },
    ])
    expect(collected.state.tick).toBe(1)
    expect(vehicleOf(collected.state, 'p1').cargo.ore).toEqual({ [String(kept)]: 1 })
    expect(collected.events).toEqual([
      expect.objectContaining({ type: 'CargoAdded', value: toCanonical(oreSalePrice(kept)) }),
    ])
  })

  it('keeps band and saleTier off CargoAdded, whose resourceTier stays the cell own', () => {
    const ore = epicOre()
    const [added] = withRegistrations([recordingSlice([], oreTier(PLANET, ore.band))], () =>
      collectOreUnit(startState(), 'p1', ore),
    ).events
    expect(added).not.toHaveProperty('band')
    expect(added).not.toHaveProperty('saleTier')
    expect(added).toMatchObject({ resourceTier: ore.resourceTier, oreId: ore.oreId })
  })

  it('never asks the provider for a unit a full hold loses', () => {
    const asked: PickupFind[] = []
    const full = withFullHold(startState())
    const collected = withRegistrations([recordingSlice(asked, 1)], () =>
      collectOreUnit(full, 'p1', epicOre()),
    )
    expect(asked).toEqual([])
    expect(collected.state).toBe(full)
    expect(collected.events).toEqual([{ type: 'StorageFull', lostUnits: 1 }])
  })
})
