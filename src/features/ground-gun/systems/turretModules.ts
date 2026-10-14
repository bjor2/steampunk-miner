/**
 * Which `auto_guns` modules act on the player's turret now (ticket 388, the #319 GD ruling's
 * conditions): a module is live only while the guns are mounted (the module requires `auto_guns`
 * owned), the player owns it, and it hangs at its `turret.*` mount. An unattached module never
 * draws, previews or fires: the mount table (`armouryMounts.json`) is the one place that says it is
 * attached, the same table the turret piece draws from, so a module the player cannot see on the
 * turret can never change a shot. Each live module acts at the Mark it plays at.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { isGunMounted } from '../../../systems/vehicle/vehicleGun'
import { SHIPPED_AUTO_GUNS_MODULES } from './autoGunsLane'
import { ownedModuleMarkOf } from './boreGunModules'
import { armouryMountOf } from './render/armouryMounts'

/** One module acting on the turret, at the Mark it plays at. */
export interface LiveTurretModule {
  itemId: string
  mark: number
}

/** Whether the module hangs at a mount on the turret; the shipped table's answer by default. */
export type TurretAttachRead = (itemId: string) => boolean

/** The modules acting on the player's turret now, in lane order; none before the guns. */
export function liveTurretModulesOf(
  state: AuthorityState,
  playerId: string,
  isAttached: TurretAttachRead = isOnTurretMount,
): LiveTurretModule[] {
  if (!isGunMounted(vehicleOf(state, playerId).gun)) return []
  return SHIPPED_AUTO_GUNS_MODULES.map(({ itemId }) => ({
    itemId,
    mark: ownedModuleMarkOf(state, playerId, itemId),
  })).filter(({ itemId, mark }) => mark > 0 && isAttached(itemId))
}

/** The live module's Mark on the player's turret: 0 when it does not act. */
export function liveTurretModuleMarkOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  isAttached: TurretAttachRead = isOnTurretMount,
): number {
  const live = liveTurretModulesOf(state, playerId, isAttached)
  return live.find((module) => module.itemId === itemId)?.mark ?? 0
}

/** The module's mount row resolves to a point on the turret. */
export function isOnTurretMount(itemId: string): boolean {
  return armouryMountOf(itemId)?.gun === 'turret'
}
