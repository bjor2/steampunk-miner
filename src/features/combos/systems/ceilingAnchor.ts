/**
 * The ceiling anchor (ticket 288; #257 GD lock, build 4; the GD ruling on #206 of 7 Oct; the 14 Oct
 * ruling on #288 over the TD lock): while the grav anchor clings, the twin-bit head may also cut
 * 45 degrees up. The combo asks the kernel's drill gear read (ticket 372) for the `up` bearing only
 * while the player owns the combo (grade 1 or more), has the twin bit in `drill.head` and clings
 * (`vehicleMotionAt(...).isClinging`), each read for that player alone, so another player's anchor
 * never grants it.
 *
 * The kernel does the rest: facing up, lifting with a side pushed turns the latch to that side;
 * every cell the diagonal crosses goes through `canMine`; the cell takes its full hardness, the
 * bit's full ticks and the twin bit's diagonal energy share; and the up-cut stops on the tick `up`
 * goes, the cell keeping its progress. No speed or yield bonus: an up-cut cell pays
 * `bandOrePriceAt` like any drilled cell, and the combo counts under no income clamp.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import type { OneShot } from '../../../systems/registries/oneShots'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { extraBearingOf, type AheadLatch } from '../../../systems/vehicle/aheadBearingLatch'
import { itemInSlot } from '../../../systems/vehicle/loadoutState'
import { isTileYielded } from '../../../systems/world/worldState'

export const CEILING_ANCHOR_ID = 'combo.ceiling_anchor'

/** The drill-gear lane's head, named by id so this slice imports no lane. */
const TWIN_BIT_ID = 'gear.twin_bit'

const UP_ASK: DrillGearAsk = { extraBearings: ['up'] }

export const CEILING_ANCHOR_GEAR: DrillGearSource = {
  id: 'combos.ceiling_anchor',
  gearOf: (state, playerId) => (isUpCutAllowed(state, playerId) ? UP_ASK : null),
}

/** The kernel's light clank, played on the anchor drop (TD lock on #288 Q2, option b). */
export const ANCHOR_DROP_CLANK: OneShot = { id: 'combos.ceiling_anchor.drop', voice: 'clankLight' }

/**
 * Whether this player's twin bit may cut up now: combo owned, head mounted, anchor clinging.
 * Grade 1 or more is ownership (`gradeOf`), read without building the tree on every drill command.
 */
export function isUpCutAllowed(state: AuthorityState, playerId: string): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  return (
    ownsItem(state, playerId, CEILING_ANCHOR_ID) &&
    isTwinBitMounted(state, playerId) &&
    isClinging(state, playerId)
  )
}

export function isClinging(state: AuthorityState, playerId: string): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  return vehicleMotionAt(state, playerId, state.tick).isClinging
}

/** The up-cut's side while one is latched and allowed; null otherwise. */
export function upCutSideOf(state: AuthorityState, playerId: string): UpCutSide | null {
  const latch = upLatchOf(state, playerId)
  return latch === null || !isUpCutAllowed(state, playerId) ? null : latch.bearing
}

/** Whether the up-cut's latched cell still stands: the dig is mid-cell. */
export function isUpCutCellStanding(state: AuthorityState, playerId: string): boolean {
  const latch = upLatchOf(state, playerId)
  return latch !== null && !isTileYielded(state.world, latch.tile)
}

export type UpCutSide = 'left' | 'right'

interface UpLatch {
  bearing: UpCutSide
  tile: AheadLatch['tile']
}

function isTwinBitMounted(state: AuthorityState, playerId: string): boolean {
  return itemInSlot(vehicleOf(state, playerId).loadout, 'drill.head') === TWIN_BIT_ID
}

/** The vehicle's ahead latch when it is turned onto the up-diagonal; else null. */
function upLatchOf(state: AuthorityState, playerId: string): UpLatch | null {
  if (!Object.hasOwn(state.players, playerId)) return null
  const { aheadLatch, pose } = vehicleOf(state, playerId)
  if (aheadLatch === undefined || pose === null || aheadLatch.bearing === 'facing') return null
  if (extraBearingOf(pose.facing, aheadLatch.bearing) !== 'up') return null
  return { bearing: aheadLatch.bearing, tile: aheadLatch.tile }
}
