/**
 * `Travel {toPlanet}` (decision #10, #24 acceptance): one authority command that changes the state
 * at once; the transition of at most 10 s is presentation only, so save, replay and co-op never
 * see a half-travelled session.
 *
 * Valid only for a docked vehicle, to the next planet, with at least `coreNeeded` fragments in the
 * bay and the travel fee in the wallet; otherwise it is refused with `not_docked`,
 * `not_next_planet`, `core_short` or `money_short` and nothing changes. It spends exactly the fee
 * and exactly `coreNeeded` fragments (surplus stays banked), moves the session to the new planet's
 * dock site, and logs `travel_started`, `planet_unlocked`, `planet_entered`,
 * `artefact_cache_spawned` (#46) and a `travel` digest.
 */
import { travelFee } from '../economy/planetCharges'
import { sub, toCanonical } from '../money'
import type { PlanetParams } from '../world/planetParams'
import { vehicleOf, withWallet, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { coreNeededOf } from './coreBay'
import type { DomainEventBody } from './domainEvent'
import { notDockedRejection } from './dockRules'
import { artefactCacheSpawnOf, planetEntryOf, withSessionOnPlanet } from './planetEntry'
import { noPlanetRejection, planetParamsOf } from './planetOfState'
import { moneyShortRejection } from './platformServices'
import { stateDigest } from './stateDigest'

export const TRAVEL_RULES: { readonly travel: CommandRule<'travel'> } = {
  travel: {
    fields: { toPlanet: 'wholeNumber' },
    reject: (state, { playerId, payload }) => travelRefusal(state, playerId, payload.toPlanet),
    apply: (state, { playerId, payload }) =>
      chainEffects(state, [
        (current) => payForTravel(current, playerId, payload.toPlanet),
        (current) => arriveAtPlanet(current, payload.toPlanet),
        (current) => digestAtTravel(current),
      ]),
  },
}

/** Why `Travel` would be refused now; null when it would go (#34 `canTravel`). */
export function travelRefusal(
  state: AuthorityState,
  playerId: string,
  toPlanet: number,
): Rejection | null {
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => notDockedRejection(vehicleOf(state, playerId)),
    () => nextPlanetRejection(state, toPlanet),
    () => coreShortRejection(state),
    () => moneyShortRejection(state.players[playerId].wallet, travelFee(state.planet.index)),
  ])
}

export function canTravel(state: AuthorityState, playerId: string): boolean {
  return travelRefusal(state, playerId, state.planet.index + 1) === null
}

function nextPlanetRejection(state: AuthorityState, toPlanet: number): Rejection | null {
  const next = state.planet.index + 1
  if (toPlanet === next) return null
  return rejectionOf('not_next_planet', `the next planet is ${next}, not ${toPlanet}`)
}

function coreShortRejection(state: AuthorityState): Rejection | null {
  const needed = coreNeededOf(state.planet) ?? 0
  if (state.platform.coreBay >= needed) return null
  return rejectionOf(
    'core_short',
    `needs ${needed} core fragments, the bay holds ${state.platform.coreBay}`,
  )
}

/** The fee and exactly `coreNeeded` fragments, said once in `travel_started`. */
function payForTravel(state: AuthorityState, playerId: string, toPlanet: number): RuleEffect {
  const wallet = state.players[playerId].wallet
  const fee = travelFee(state.planet.index)
  const coreSpent = coreNeededOf(state.planet) ?? 0
  const paid = withWallet(state, playerId, sub(wallet, fee))
  return {
    state: { ...paid, platform: { ...paid.platform, coreBay: paid.platform.coreBay - coreSpent } },
    events: [
      {
        type: 'TravelStarted',
        fromPlanet: state.planet.index,
        toPlanet,
        cost: toCanonical(fee),
        coreSpent,
      },
      { type: 'MoneyChanged', from: toCanonical(wallet), to: toCanonical(sub(wallet, fee)) },
    ],
  }
}

/** The slice has no separate unlock step: reaching a planet unlocks it (#2 log sequence). */
function arriveAtPlanet(state: AuthorityState, toPlanet: number): RuleEffect {
  const arrived = withSessionOnPlanet(state, { ...state.planet, index: toPlanet })
  const params = planetParamsOf(arrived.planet)
  return {
    state: arrived,
    events: [
      { type: 'PlanetUnlocked', planetIndex: toPlanet },
      ...(params === null ? [] : arrivalEventsOf(params)),
    ],
  }
}

function arrivalEventsOf(params: PlanetParams): DomainEventBody[] {
  return [
    { type: 'PlanetEntered', ...planetEntryOf(params) },
    { type: 'ArtefactCacheSpawned', ...artefactCacheSpawnOf(params) },
  ]
}

function digestAtTravel(state: AuthorityState): RuleEffect {
  return { state, events: [{ type: 'StateDigested', digest: stateDigest(state), scope: 'travel' }] }
}
