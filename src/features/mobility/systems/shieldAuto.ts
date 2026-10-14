/**
 * The steam shield acting on its own (ticket 328, the GD lock on #206 decision 6): the mobility
 * lane's `autoFire` consult, on #317's auto mode core keyed by the shield's item id. A combo (the
 * alarm shield, 206b) answers the `autoFire` hook on the shield; with no answer the shield never
 * acts on its own.
 *
 * - **Trigger.** Only an enemy winding up a lunge on the player (`lungeWarningsOf`, read on the
 *   authority within `itemHookCaps.reachCellsMax`), never a timer. The fires the hooks answer are
 *   held to the warnings and to the shield's charges left; with none the shield holds `no_target`.
 *   That hold is asked every tick before any target, so a wind-up is seen on its first tick: 10
 *   ticks of preview and the shield's 6-tick wind-up fit inside an enemy's 24.
 * - **Numbers.** The ones auto-shoot reads (#322's `autoShoot`: the preview and the one shared
 *   energy reserve), and #317's override gap, the steam sear's 60-tick wait after a manual use,
 *   never below its floor of 20.
 * - **Holds.** The core's own (docked, anchored, a collapse warning in the rig's block, the energy
 *   reserve after the act), `unavailable` while no slot holds the shield, and `recovering` until
 *   the shield is ready on its one clock (`autoUseReadyTickOf`: no use pending, its cooldown run,
 *   a use by hand's override gap folded in).
 * - **Act.** The shield's slot pressed as a key presses it (`pressItemOnAuto`): its own charge, its
 *   wind-up and its cooldown, refused for the same reasons, logged `power_up_auto_fired`. It moves
 *   nothing, so `vehicleMotionEffects` and the pose check are untouched.
 */
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { enemyById } from '../../../systems/authority/combat/combatState'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { lungeWarningsOf } from '../../../systems/authority/sensingQueries'
import { ECONOMY } from '../../../systems/economy/economy'
import type { AutoActor, AutoSettings, AutoTarget } from '../../../systems/registries/autoActors'
import { scalarHookValueOf, type ItemHookContext } from '../../../systems/registries/itemHooks'
import { slotHoldingItem } from '../../../systems/vehicle/loadoutState'
import { tileOfMillimetres, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { armouryModuleOf, GROUND_GUN } from '../../ground-gun'
import {
  autoUseReadyTickOf,
  chargesLeftOf,
  POWER_UP_AUTO_AIM,
  powerUpAtMarkOf,
  pressItemOnAuto,
} from '../../power-up-core'
import { MOBILITY_ITEM } from './itemIds'

const SHIELD = MOBILITY_ITEM.steamShield

const SHIELD_AUTO_SETTINGS: AutoSettings = {
  previewTicks: GROUND_GUN.autoShoot.previewTicks,
  manualWaitTicks: Math.max(
    armouryModuleOf(STEAM_SEAR_ITEM_ID).stats.manualWaitTicks,
    GROUND_GUN.autoShoot.manualWaitFloorTicks,
  ),
  reserveAboveRescueBp: GROUND_GUN.autoShoot.reserveAboveRescueBp,
}

export const SHIELD_AUTO_ACTOR: AutoActor = {
  id: 'mobility.steam-shield-auto',
  itemId: SHIELD,
  settingsOf: (state, playerId) => (isShieldSlotted(state, playerId) ? SHIELD_AUTO_SETTINGS : null),
  readyTickOf: (state, playerId) => autoUseReadyTickOf(state, playerId, SHIELD),
  holdOf: (state, playerId) => (autoFiresOf(state, playerId) === 0 ? 'no_target' : null),
  bestTargetOf: shieldTargetOf,
  targetAlong: (state, playerId) => shieldTargetOf(state, playerId),
  holdAt: () => null,
  act: (state, playerId, _aim, tick) => pressItemOnAuto(state, playerId, SHIELD, tick),
}

/**
 * How many fires the `autoFire` hooks answer now: 0 with no lunge warning, else their sum held
 * to the warnings and to the charges left.
 */
export function autoFiresOf(state: AuthorityState, playerId: string): number {
  const warnings = lungeWarningsOf(state, playerId, ECONOMY.itemHookCaps.reachCellsMax)
  if (warnings.length === 0) return 0
  const ceiling = Math.min(warnings.length, chargesLeftOf(state, playerId, SHIELD))
  const ctx = shieldContextOf(state, playerId)
  return scalarHookValueOf(state, playerId, {
    point: 'autoFire',
    parentItemId: SHIELD,
    ctx,
    base: 0,
    ceiling,
  })
}

/** The nearest lunging enemy's tile, while a hook answers a fire; else none. */
function shieldTargetOf(state: AuthorityState, playerId: string): AutoTarget | null {
  if (autoFiresOf(state, playerId) === 0) return null
  const [nearest] = lungeWarningsOf(state, playerId, ECONOMY.itemHookCaps.reachCellsMax)
  const enemy = enemyById(state.combat, nearest.enemyId)
  if (enemy === undefined) return null
  return { aim: POWER_UP_AUTO_AIM, tile: tileOfMillimetres(enemy.x, enemy.y), energyQuanta: 0 }
}

/** What the hooks hear: the shield's Mark and magnitude, from the rig's tile; no candidates. */
function shieldContextOf(state: AuthorityState, playerId: string): ItemHookContext {
  const marked = powerUpAtMarkOf(state, playerId, SHIELD)
  const pose = vehicleOf(state, playerId).pose
  return {
    tick: state.tick,
    mark: marked?.mark ?? 0,
    magnitude: marked?.magnitude ?? 0,
    origin: pose === null ? { tx: 0, ty: 0 } : tileOfPose(pose),
    candidates: [],
  }
}

function isShieldSlotted(state: AuthorityState, playerId: string): boolean {
  return slotHoldingItem(vehicleOf(state, playerId).loadout, SHIELD) !== null
}
