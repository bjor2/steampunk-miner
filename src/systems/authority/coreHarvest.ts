/**
 * Breaking a core tile (decision #10, #24 acceptance): the tile is gone for good, the hold takes
 * `fragmentsPerTile` fragments if it has room, and the log says how many core tiles remain. The
 * first core tile of a planet is also `core_reached`. With a full hold the tile still breaks and
 * still counts; its fragment is lost like an ore unit (#7) and `storage_full` says so. Fragments
 * are not ore: they never get a sale value or a `resource_collected` line.
 */
import { fragmentsPerCoreTile } from '../economy/planetEconomy'
import { cargoUnitsOf, statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { coreTileCount } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'

/** Call after the tile is removed; the authority's tick is the breaking command's tick. */
export function harvestCoreTile(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): RuleEffect {
  return chainEffects(state, [
    (current) => markCoreReached(current),
    (current) => collectCoreFragments(current, playerId, params),
  ])
}

function markCoreReached(state: AuthorityState): RuleEffect {
  if (state.core.reachedTick !== null) return unchanged(state)
  return {
    state: { ...state, core: { ...state.core, reachedTick: state.tick } },
    events: [{ type: 'CoreReached' }],
  }
}

function collectCoreFragments(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const fragments = Math.min(fragmentsPerCoreTile(), freeCargoUnitsOf(vehicle))
  const harvestedTiles = state.core.harvestedTiles + 1
  const held = withVehicle(state, playerId, {
    ...vehicle,
    cargo: { ...vehicle.cargo, coreFragments: vehicle.cargo.coreFragments + fragments },
  })
  return {
    state: { ...held, core: { ...held.core, harvestedTiles } },
    events: [
      {
        type: 'CoreTileHarvested',
        tilesRemaining: coreTileCount(params) - harvestedTiles,
        fragments,
      },
      ...lostFragmentEvents(fragmentsPerCoreTile() - fragments),
    ],
  }
}

function freeCargoUnitsOf(vehicle: VehicleState): number {
  return Math.max(0, statsOfVehicle(vehicle).cargoCapacity - cargoUnitsOf(vehicle.cargo))
}

function lostFragmentEvents(lostUnits: number): DomainEventBody[] {
  return lostUnits > 0 ? [{ type: 'StorageFull', lostUnits }] : []
}
