/**
 * Buying and switching the `auto_guns` turret (#107 design and numbers, built by #93):
 *
 * - `BuyGun`: at the Upgrade bay only, once `auto_guns` is unlocked (planet 4, #80). The first buy
 *   mounts the guns at level 1 for 30 band-5 ore units and logs `gun_mounted`; each later buy
 *   raises the gun track one level, up to its cap, and logs `gun_upgraded`. The guns are not a
 *   vehicle track, so they never move the visual tier.
 * - `SetGunMode {auto | off}`: the HUD toggle, any time the vehicle has guns; logs `gun_mode`.
 * - `debug.setGunLevel`: a scenario's guns, 0 (none) to the cap, with no unlock or price.
 *
 * A refused command changes nothing.
 */
import { gunMaxLevel, nextGunPrice } from '../economy/gunStats'
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
import type { DomainEventBody } from './domainEvent'
import { isFeatureUnlocked } from './featureUnlocks'
import { moneyShortRejection } from './platformServices'

/** The schedule row the guns open with (#80, #107). */
export const AUTO_GUNS_ROW_ID = 'auto_guns'

export const GUN_RULES: {
  readonly buyGun: CommandRule<'buyGun'>
  readonly setGunMode: CommandRule<'setGunMode'>
} = {
  buyGun: {
    fields: {},
    reject: (state, { playerId }) => gunBuyRefusal(state, playerId),
    apply: (state, { playerId }) => buyNextGunLevel(state, playerId),
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

/** Why the next gun buy would be refused now; null when it would apply. */
export function gunBuyRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedGunRejection(state),
    () => maxGunLevelRejection(gunOf(state, playerId)),
    () => moneyShortRejection(state.players[playerId].wallet, nextGunPriceOf(state, playerId)),
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
  if (gun.level < gunMaxLevel()) return null
  return rejectionOf('max_level', `the guns are at their top level ${gunMaxLevel()}`)
}

function gunLevelRangeRejection(level: number): Rejection | null {
  if (level <= gunMaxLevel()) return null
  return rejectionOf('out_of_range', `level must be 0 to ${gunMaxLevel()}, got ${level}`)
}

function gunModeRefusal(state: AuthorityState, playerId: string, mode: string): Rejection | null {
  if (!isGunMode(mode)) return rejectionOf('unknown_mode', `mode must be auto or off, got ${mode}`)
  if (isGunMounted(gunOf(state, playerId))) return null
  return rejectionOf('no_guns', 'the vehicle has no guns to switch')
}

function buyNextGunLevel(state: AuthorityState, playerId: string): RuleEffect {
  const gun = gunOf(state, playerId)
  const price = nextGunPriceOf(state, playerId)
  const raised = withGun(state, playerId, { ...gun, level: gun.level + 1 })
  return {
    state: withWallet(raised, playerId, sub(state.players[playerId].wallet, price)),
    events: [gunBuyEvent(gun, price)],
  }
}

function gunBuyEvent(before: VehicleGun, price: Money): DomainEventBody {
  const to = before.level + 1
  if (isGunMounted(before)) {
    return { type: 'GunUpgraded', from: before.level, to, price: toCanonical(price) }
  }
  return { type: 'GunMounted', level: to, price: toCanonical(price) }
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
