/**
 * `Travel {toPlanet}` (decision #10, #24 acceptance): one authority command that changes the state
 * at once; the transition of at most 10 s is presentation only, so save, replay and co-op never
 * see a half-travelled session.
 *
 * Valid only for a docked vehicle, to the next planet, with at least `coreNeeded` fragments in the
 * bay; otherwise it is refused with `not_docked`, `not_next_planet` or `core_short` and nothing
 * changes. Money never refuses it (ticket 648): the hop costs the clamped fee `travelChargeOf`,
 * reduced or free when the wallet is short. It spends exactly that charge and exactly `coreNeeded`
 * fragments (surplus stays banked), moves the session to the new planet's
 * dock site, and logs `travel_started`, `planet_unlocked`, a `feature_unlocked` per schedule row
 * opened on arrival (#88), `planet_entered`, `artefact_cache_spawned` (#46) and a `travel` digest.
 */
import { planetPriceRow } from '../economy/economyTables'
import { travelChargeOf } from '../economy/travelCharge'
import { sub, toCanonical, type Money } from '../money'
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
import { featureUnlocksOfTravel } from './featureUnlocks'
import type { DomainEventBody } from './domainEvent'
import { notDockedRejection } from './dockRules'
import { artefactCacheSpawnOf, planetEntryOf, withSessionOnPlanet } from './planetEntry'
import { noPlanetRejection, planetParamsOf, type SessionPlanet } from './planetOfState'
import { stateDigest } from './stateDigest'

export const TRAVEL_RULES: { readonly travel: CommandRule<'travel'> } = {
  travel: {
    fields: { toPlanet: 'wholeNumber' },
    reject: (state, { playerId, payload }) => travelRefusal(state, playerId, payload.toPlanet),
    apply: (state, { playerId, payload }) =>
      chainEffects(state, [
        (current) => payForTravel(current, playerId, payload.toPlanet),
        (current) => arriveAtPlanet(current, nextPlanetOf(current, payload.toPlanet)),
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

/** What `Travel` would charge the player now: never above the wallet, so it never refuses. */
export function travelChargeNow(state: AuthorityState, playerId: string): Money {
  return travelChargeOf(planetPriceRow(state.planet.index), state.players[playerId].wallet)
}

/** The charge and exactly `coreNeeded` fragments, said once in `travel_started`. */
function payForTravel(state: AuthorityState, playerId: string, toPlanet: number): RuleEffect {
  const wallet = state.players[playerId].wallet
  const fee = travelChargeNow(state, playerId)
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

/** The planet `toPlanet` of the session's system, on the session's world seed. */
function nextPlanetOf(state: AuthorityState, toPlanet: number): SessionPlanet {
  return { ...state.planet, index: toPlanet }
}

/**
 * The slice has no separate unlock step: reaching a planet unlocks it (#2 log sequence), and with
 * it the schedule's `planet_gate` rows listed on that planet (#88).
 */
function arriveAtPlanet(state: AuthorityState, to: SessionPlanet): RuleEffect {
  return enterPlanetByTravel(state, to, [{ type: 'PlanetUnlocked', planetIndex: to.index }])
}

/**
 * The session moved to `to` and the arrival said: `unlocked` first, then the schedule rows the
 * move opens (#88), `planet_entered` and `artefact_cache_spawned`. `Travel` and the star map's
 * jump (ticket 755) both arrive through here.
 */
export function enterPlanetByTravel(
  state: AuthorityState,
  to: SessionPlanet,
  unlocked: readonly DomainEventBody[],
): RuleEffect {
  const arrived = withSessionOnPlanet(state, to)
  const params = planetParamsOf(arrived.planet)
  return {
    state: arrived,
    events: [
      ...unlocked,
      ...featureUnlocksOfTravel(state.planet.index, to.index),
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

export function digestAtTravel(state: AuthorityState): RuleEffect {
  return { state, events: [{ type: 'StateDigested', digest: stateDigest(state), scope: 'travel' }] }
}
