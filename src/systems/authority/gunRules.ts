/**
 * Buying and switching the `auto_guns` turret (#107 design and numbers, built by #93):
 *
 * - `BuyGun`: at the Upgrade bay only, once `auto_guns` is unlocked (planet 4, #80). The first buy
 *   mounts the guns, their first major (step 10, #180), for 30 band-5 ore units and logs
 *   `gun_mounted`; each later buy raises the gun track one step, up to its cap of 16 majors, and
 *   logs `gun_upgraded`. The guns are not a vehicle track, so they never move the visual tier.
 *   A held step (`chain` not 0) is also refused under the service reserve (`purchaseChain.ts`).
 * - `SetGunMode {auto | off}`: the HUD toggle, any time the vehicle has guns; logs `gun_mode`.
 * - `debug.setGunLevel`: a scenario's guns as a step, 0 (none) or the mount to the cap, with no
 *   unlock or price.
 *
 * A refused command changes nothing.
 */
import { gunMountStep, gunTopStep, nextGunPrice } from '../economy/gunStats'
import { sub, toCanonical, type Money } from '../money'
import { isGunMode, isGunMounted, type GunMode, type VehicleGun } from '../vehicle/vehicleGun'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
  unchanged,
} from './commandRule'
import { atBayRejection } from './dockRules'
import type { DomainEventBody, PurchaseChainStamp } from './domainEvent'
import { isFeatureUnlocked } from './featureUnlocks'
import { moneyShortRejection } from './platformServices'
import { chainStampOf, serviceReserveRejection } from './purchaseChain'

/** The schedule row the guns open with (#80, #107). */
export const AUTO_GUNS_ROW_ID = 'auto_guns'

export const GUN_RULES: {
  readonly buyGun: CommandRule<'buyGun'>
  readonly setGunMode: CommandRule<'setGunMode'>
} = {
  buyGun: {
    fields: { chain: 'wholeNumber' },
    reject: (state, { playerId, payload }) => gunBuyRefusal(state, playerId, payload.chain),
    apply: (state, { playerId, payload }) => buyNextGunLevel(state, playerId, payload.chain),
  },
  setGunMode: {
    fields: { mode: 'text' },
    reject: (state, { playerId, payload }) => gunModeRefusal(state, playerId, payload.mode),
    apply: (state, { playerId, payload }) =>
      isGunMode(payload.mode) ? switchGunMode(state, playerId, payload.mode) : unchanged(state),
  },
}

export const GUN_DEBUG_RULES: { readonly 'debug.setGunLevel': CommandRule<'debug.setGunLevel'> } = {
  'debug.setGunLevel': {
    fields: { level: 'wholeNumber' },
    reject: (_state, { payload }) => gunLevelRangeRejection(payload.level),
    apply: (state, { playerId, payload }) => ({
      state: withGun(state, playerId, { ...gunOf(state, playerId), level: payload.level }),
      events: [],
    }),
  },
}

/** Why the next gun buy in `chain` would be refused now; null when it would apply. */
export function gunBuyRefusal(
  state: AuthorityState,
  playerId: string,
  chain: number,
): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedGunRejection(state),
    () => maxGunLevelRejection(gunOf(state, playerId)),
    () => moneyShortRejection(state.players[playerId].wallet, nextGunPriceOf(state, playerId)),
    () => serviceReserveRejection(state, playerId, chain, nextGunPriceOf(state, playerId)),
  ])
}

/** What the next gun buy costs this player here: the mount, or the next level. */
export function nextGunPriceOf(state: AuthorityState, playerId: string): Money {
  return nextGunPrice(gunOf(state, playerId).level, state.planet.index)
}

/** Whether the Upgrade bay shows the Guns row: unlocked here, or already bolted on. */
export function isGunOffered(state: AuthorityState, playerId: string): boolean {
  return isFeatureUnlocked(state, AUTO_GUNS_ROW_ID) || isGunMounted(gunOf(state, playerId))
}

export function gunOf(state: AuthorityState, playerId: string): VehicleGun {
  return vehicleOf(state, playerId).gun
}

function lockedGunRejection(state: AuthorityState): Rejection | null {
  if (isFeatureUnlocked(state, AUTO_GUNS_ROW_ID)) return null
  return rejectionOf('feature_locked', `${AUTO_GUNS_ROW_ID} opens on planet 4`)
}

function maxGunLevelRejection(gun: VehicleGun): Rejection | null {
  if (gun.level < gunTopStep()) return null
  return rejectionOf('max_level', `the guns are at their top step ${gunTopStep()}`)
}

/** A gun step is 0 (none) or from the mount to the top: a tenth of a mount means nothing. */
function gunLevelRangeRejection(level: number): Rejection | null {
  if (level === 0 || (level >= gunMountStep() && level <= gunTopStep())) return null
  const range = `0 or ${gunMountStep()} to ${gunTopStep()}`
  return rejectionOf('out_of_range', `level must be ${range}, got ${level}`)
}

function gunModeRefusal(state: AuthorityState, playerId: string, mode: string): Rejection | null {
  if (!isGunMode(mode)) return rejectionOf('unknown_mode', `mode must be auto or off, got ${mode}`)
  if (isGunMounted(gunOf(state, playerId))) return null
  return rejectionOf('no_guns', 'the vehicle has no guns to switch')
}

function buyNextGunLevel(state: AuthorityState, playerId: string, chain: number): RuleEffect {
  const gun = gunOf(state, playerId)
  const price = nextGunPriceOf(state, playerId)
  const raised = withGun(state, playerId, { ...gun, level: nextGunStep(gun) })
  const paid = withWallet(raised, playerId, sub(state.players[playerId].wallet, price))
  return {
    state: paid,
    events: [gunBuyEvent(gun, price, chainStampOf(paid, playerId, chain))],
  }
}

/** The mount lands the whole first major; every later buy is one step. */
export function nextGunStep(gun: VehicleGun): number {
  return isGunMounted(gun) ? gun.level + 1 : gunMountStep()
}

function gunBuyEvent(
  before: VehicleGun,
  price: Money,
  chainStamp: PurchaseChainStamp,
): DomainEventBody {
  const to = nextGunStep(before)
  const paid = { price: toCanonical(price), ...chainStamp }
  if (isGunMounted(before)) return { type: 'GunUpgraded', from: before.level, to, ...paid }
  return { type: 'GunMounted', level: to, ...paid }
}

function switchGunMode(state: AuthorityState, playerId: string, mode: GunMode): RuleEffect {
  return {
    state: withGun(state, playerId, { ...gunOf(state, playerId), mode }),
    events: [{ type: 'GunModeChanged', mode }],
  }
}

function withGun(state: AuthorityState, playerId: string, gun: VehicleGun): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), gun })
}
