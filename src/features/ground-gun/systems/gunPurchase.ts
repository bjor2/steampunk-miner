/**
 * Buying the bore gun at the Upgrade bay (ticket 314, the #309 GD decision point 4 with #322's
 * locked re-pricing). Two commands, each paid in money with no ammo and no new currency, the card
 * price being the debit:
 *
 * - `ground-gun.mount {}`: bolts the gun on with the first level of all three tracks, for one
 *   band-5 unit at its target planet (the GD's Q2 ruling on #314: the mount is the visible step,
 *   affordable on the second dock visit).
 * - `ground-gun.buy_level {track}`: one more level of `rate`, `penetration` or `energy` from L2,
 *   priced by `trackLevelPrice` at that level's target planet. A track at its wall is never sold
 *   again.
 *
 * Both are on sale once the `bore_gun` schedule row ships (its planet, P1, only prices the mount:
 * #411). A refusal changes nothing and is answered by
 * the kernel's `CommandRejected`; a buy is answered by its own event and the wallet's
 * `MoneyChanged`.
 *
 * `debug.ground-gun.setLevels {rate, penetration, energy}` sets the levels free, for specs,
 * scenarios and the forced-gun run; it logs only the kernel's `debug_command_applied`, so it never
 * counts as play. All zero takes the gun off; otherwise every track is 1 to its wall.
 */
import { BORE_GUN_ROW_ID } from '../../../systems/authority/bore/boreFire'
import { withWallet, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  firstRejection,
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import { atBayRejection } from '../../../systems/authority/dockRules'
import { isFeatureForSale } from '../../../systems/authority/featureSales'
import { moneyShortRejection } from '../../../systems/authority/platformServices'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { sub, toCanonical, type Money } from '../../../systems/money'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import { GROUND_GUN, GUN_TRACK_IDS, type GunTrackId } from './groundGunEconomy'
import {
  gunLevelsOf,
  isGunMounted,
  mountedLevels,
  MOUNTED_LEVEL,
  raisedLevels,
  withGunLevels,
  type GunLevels,
} from './gunLevels'
import { isTrackMaxed, trackLevelPrice, wallLevelOf } from './gunTracks'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'ground-gun.mount': Record<string, never>
    'ground-gun.buy_level': { track: string }
    'debug.ground-gun.setLevels': { rate: number; penetration: number; energy: number }
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** The gun is on the miner, every track at its first level; `price` is canonical Money. */
    'ground-gun.GunMounted': { price: string }
    'ground-gun.TrackLevelBought': { track: GunTrackId; from: number; to: number; price: string }
  }
  interface RejectionReasons {
    'ground-gun.unknown_track': true
    'ground-gun.gun_mounted': true
    'ground-gun.gun_not_mounted': true
  }
}

export const MOUNT_COMMAND = 'ground-gun.mount'
export const BUY_LEVEL_COMMAND = 'ground-gun.buy_level'
export const SET_LEVELS_COMMAND = 'debug.ground-gun.setLevels'

export const GUN_PURCHASE_RULES: SliceCommandRules = {
  'ground-gun.mount': {
    fields: {},
    reject: (state, { playerId }) => mountRefusal(state, playerId),
    apply: (state, { playerId }) => mountGun(state, playerId),
  },
  'ground-gun.buy_level': {
    fields: { track: 'text' },
    reject: (state, { playerId, payload }) => levelRefusal(state, playerId, payload.track),
    apply: (state, { playerId, payload }) =>
      buyTrackLevel(state, playerId, payload.track as GunTrackId),
  },
  'debug.ground-gun.setLevels': {
    fields: { rate: 'wholeNumber', penetration: 'wholeNumber', energy: 'wholeNumber' },
    reject: (_state, { payload }) => levelsRangeRejection(payload),
    apply: (state, { playerId, payload }) => ({
      state: withGunLevels(state, playerId, payload),
      events: [],
    }),
  },
}

/** What the mount costs: `groundGun.json`'s `mount`, priced as a tree node is. */
export function mountPrice(): Money {
  const { band, oreUnits, targetPlanet } = GROUND_GUN.mount
  return bandOrePriceAt({ band, oreUnits }, targetPlanet, targetPlanet)
}

/** What the next level of `trackId` costs these levels; null at the wall. */
export function nextLevelPrice(levels: GunLevels, trackId: GunTrackId): Money | null {
  if (isTrackMaxed(trackId, levels[trackId])) return null
  return trackLevelPrice(trackId, levels[trackId] + 1)
}

export function isGunTrackId(track: string): track is GunTrackId {
  return (GUN_TRACK_IDS as readonly string[]).includes(track)
}

/** Why the mount would be refused now; null when it would apply. */
export function mountRefusal(state: AuthorityState, playerId: string): Rejection | null {
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => lockedGunRejection(state),
    () => alreadyMountedRejection(gunLevelsOf(state, playerId)),
    () => moneyShortRejection(state.players[playerId].wallet, mountPrice()),
  ])
}

/** Why the next level of `track` would be refused now; null when it would apply. */
export function levelRefusal(
  state: AuthorityState,
  playerId: string,
  track: string,
): Rejection | null {
  const levels = gunLevelsOf(state, playerId)
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => unknownTrackRejection(track),
    () => notMountedRejection(levels),
    () => wallRejection(levels, track as GunTrackId),
    () =>
      moneyShortRejection(
        state.players[playerId].wallet,
        nextLevelPrice(levels, track as GunTrackId) as Money,
      ),
  ])
}

function mountGun(state: AuthorityState, playerId: string): RuleEffect {
  const price = mountPrice()
  return {
    state: withGunLevels(paidFrom(state, playerId, price), playerId, mountedLevels()),
    events: [
      { type: 'ground-gun.GunMounted', price: toCanonical(price) },
      walletChangeOf(state, playerId, price),
    ],
  }
}

function buyTrackLevel(state: AuthorityState, playerId: string, trackId: GunTrackId): RuleEffect {
  const levels = gunLevelsOf(state, playerId)
  const price = nextLevelPrice(levels, trackId) as Money
  const raised = raisedLevels(levels, trackId)
  return {
    state: withGunLevels(paidFrom(state, playerId, price), playerId, raised),
    events: [
      {
        type: 'ground-gun.TrackLevelBought',
        track: trackId,
        from: levels[trackId],
        to: raised[trackId],
        price: toCanonical(price),
      },
      walletChangeOf(state, playerId, price),
    ],
  }
}

function paidFrom(state: AuthorityState, playerId: string, price: Money): AuthorityState {
  return withWallet(state, playerId, sub(state.players[playerId].wallet, price))
}

function walletChangeOf(state: AuthorityState, playerId: string, price: Money) {
  const wallet = state.players[playerId].wallet
  return {
    type: 'MoneyChanged' as const,
    from: toCanonical(wallet),
    to: toCanonical(sub(wallet, price)),
  }
}

function lockedGunRejection(state: AuthorityState): Rejection | null {
  if (isFeatureForSale(state, BORE_GUN_ROW_ID)) return null
  return rejectionOf('feature_locked', `${BORE_GUN_ROW_ID} ships nothing yet`)
}

function alreadyMountedRejection(levels: GunLevels): Rejection | null {
  if (!isGunMounted(levels)) return null
  return rejectionOf('ground-gun.gun_mounted', 'the bore gun is already on the miner')
}

function notMountedRejection(levels: GunLevels): Rejection | null {
  if (isGunMounted(levels)) return null
  return rejectionOf('ground-gun.gun_not_mounted', 'mount the bore gun before its tracks')
}

function unknownTrackRejection(track: string): Rejection | null {
  if (isGunTrackId(track)) return null
  return rejectionOf('ground-gun.unknown_track', `track must be ${GUN_TRACK_IDS.join(', ')}`)
}

/** All zero (no gun), or every track from its first level to its wall. */
function levelsRangeRejection(levels: GunLevels): Rejection | null {
  if (GUN_TRACK_IDS.every((trackId) => levels[trackId] === 0)) return null
  const outside = GUN_TRACK_IDS.filter((trackId) => !isLevelOnTrack(trackId, levels[trackId]))
  if (outside.length === 0) return null
  return rejectionOf('out_of_range', `levels out of range: ${outside.join(', ')}`)
}

function isLevelOnTrack(trackId: GunTrackId, level: number): boolean {
  return level >= MOUNTED_LEVEL && level <= wallLevelOf(trackId)
}

function wallRejection(levels: GunLevels, trackId: GunTrackId): Rejection | null {
  if (!isTrackMaxed(trackId, levels[trackId])) return null
  return rejectionOf('max_level', `${trackId} is at its wall, level ${wallLevelOf(trackId)}`)
}
