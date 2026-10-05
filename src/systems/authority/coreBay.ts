/**
 * The platform's core bay (decision #10, #8 Game Director's rule): the fragments a vehicle carries
 * move into the bay when it docks and when the tow brings it home, so core is never lost. When the
 * bay first holds `coreNeeded` fragments the platform shows its `core_drive` (#23 acceptance 8,
 * not when the first core tile breaks), once for the run.
 */
import { coreFragmentsNeeded } from '../economy/planetEconomy'
import { coreTileCount } from '../world/planetGeometry'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { chainEffects, unchanged, type RuleEffect } from './commandRule'
import type { CoreDepositSource } from './domainEvent'
import { planetParamsOf, type SessionPlanet } from './planetOfState'

export function bankCoreFragments(
  state: AuthorityState,
  playerId: string,
  source: CoreDepositSource,
): RuleEffect {
  return chainEffects(state, [
    (current) => depositHeldFragments(current, playerId, source),
    (current) => showCoreDriveOnceBayIsFull(current),
  ])
}

/** `ceil(0.4 * coreTileCount)` of the session's planet; null when it has no world. */
export function coreNeededOf(planet: SessionPlanet): number | null {
  const params = planetParamsOf(planet)
  return params === null ? null : coreFragmentsNeeded(coreTileCount(params))
}

function depositHeldFragments(
  state: AuthorityState,
  playerId: string,
  source: CoreDepositSource,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const fragments = vehicle.cargo.coreFragments
  if (fragments === 0) return unchanged(state)
  const total = state.platform.coreBay + fragments
  const emptied = withVehicle(state, playerId, {
    ...vehicle,
    cargo: { ...vehicle.cargo, coreFragments: 0 },
  })
  return {
    state: { ...emptied, platform: { ...emptied.platform, coreBay: total } },
    events: [{ type: 'CoreBayDeposited', fragments, total, source }],
  }
}

function showCoreDriveOnceBayIsFull(state: AuthorityState): RuleEffect {
  const needed = coreNeededOf(state.planet)
  const isOutpost = state.platform.visualState === 'outpost'
  if (!isOutpost || needed === null || state.platform.coreBay < needed) return unchanged(state)
  return {
    state: { ...state, platform: { ...state.platform, visualState: 'core_drive' } },
    events: [{ type: 'PlatformConfigurationChanged', visualState: 'core_drive' }],
  }
}
