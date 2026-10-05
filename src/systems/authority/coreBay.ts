/**
 * The platform's core bay (decision #10, #8 Game Director's rule): the fragments a vehicle carries
 * move into the bay when it docks and when the tow brings it home, so core is never lost. When the
 * bay first holds `coreNeeded` fragments the platform shows its `core_drive` (#23 acceptance 8,
 * not when the first core tile breaks), once for the run. Reaching `coreNeeded` also completes the
 * core of the planet the session is on (`core_completed`), once per planet.
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
  tick: number,
): RuleEffect {
  return chainEffects(state, [
    (current) => depositHeldFragments(current, playerId, source),
    (current) => followBayTotal(current, tick),
  ])
}

/** What a new bay total may bring: the core drive look, then the planet's core completed. */
export function followBayTotal(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(state, [
    (current) => showCoreDriveOnceBayIsFull(current),
    (current) => completeCoreOnceBayIsFull(current, tick),
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
  const isOutpost = state.platform.visualState === 'outpost'
  if (!isOutpost || !isBayFull(state)) return unchanged(state)
  return {
    state: { ...state, platform: { ...state.platform, visualState: 'core_drive' } },
    events: [{ type: 'PlatformConfigurationChanged', visualState: 'core_drive' }],
  }
}

/** `durationTicks` runs from `core_reached`; a bay filled by a debug command never reached it. */
function completeCoreOnceBayIsFull(state: AuthorityState, tick: number): RuleEffect {
  if (state.core.isCompleted || !isBayFull(state)) return unchanged(state)
  const durationTicks = tick - (state.core.reachedTick ?? tick)
  return {
    state: { ...state, core: { ...state.core, isCompleted: true } },
    events: [{ type: 'CoreCompleted', durationTicks }],
  }
}

function isBayFull(state: AuthorityState): boolean {
  const needed = coreNeededOf(state.planet)
  return needed !== null && state.platform.coreBay >= needed
}
