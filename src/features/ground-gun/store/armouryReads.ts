/**
 * The Armoury modules the local player's guns carry now (ticket 321), as one string per gun, so a
 * piece renders again only when a module is bought or Mastered, never per frame.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { boughtModulesOf } from '../systems/boughtModules'
import type { ArmouryGun, BoughtModule } from '../systems/render/armouryMounts'

export function readBoughtBoreModulesKey(): string {
  return boughtModulesKeyOf('bore')
}

export function readBoughtTurretModulesKey(): string {
  return boughtModulesKeyOf('turret')
}

export function boughtModulesOfKey(key: string): BoughtModule[] {
  return JSON.parse(key) as BoughtModule[]
}

function boughtModulesKeyOf(gun: ArmouryGun): string {
  const { playerId } = useGameStore.getState()
  return JSON.stringify(boughtModulesOf(readAuthorityState(), playerId, gun))
}
