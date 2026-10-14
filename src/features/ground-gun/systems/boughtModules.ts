/**
 * Which Armoury modules the player's guns carry now (ticket 321): every owned module of the gun,
 * gilded once it acts at its Mastered Mark (#310). The Mark is the one the module plays at
 * (`ownedModuleMarkOf`), its ladder the one the registered tree holds, so a module the tree does
 * not hold is never gilded.
 */
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isMasteredAt, markLadderOfItem } from '../../tech-tree'
import { ownedModuleMarkOf } from './boreGunModules'
import { moduleItemIdsOn, type ArmouryGun, type BoughtModule } from './render/armouryMounts'

export function boughtModulesOf(
  state: AuthorityState,
  playerId: string,
  gun: ArmouryGun,
): BoughtModule[] {
  return moduleItemIdsOn(gun)
    .filter((itemId) => ownsItem(state, playerId, itemId))
    .map((itemId) => ({
      itemId,
      isMastered: isMasteredModule(itemId, ownedModuleMarkOf(state, playerId, itemId)),
    }))
}

function isMasteredModule(itemId: string, mark: number): boolean {
  const ladder = markLadderOfItem(itemId)
  return ladder !== null && isMasteredAt(ladder, mark)
}
