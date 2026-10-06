/**
 * The platform's command intents (decision #8 registered commands, #23), as the store submits
 * them: `Dock {bay}`, `Undock`, `SellCargo {resourceTier | all}`, `RepairHull`, `RechargeEnergy`,
 * `QuickService`, `BuyUpgrade {upgradeId}`, `BuyCasingGrade`, `BuyGun` (#107), `Travel {toPlanet}`
 * (#10), and the Refinery bay's `QueueRefine`, `BuyRefinerySlot` and the Sell bay's
 * `CollectRefined` (#105). The authority checks and prices each one.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { OreSelection } from '../authority/platformServices'
import type { BayId } from '../world/dockBays'

export function dockCommand(bay: BayId): CommandIntent<'dock'> {
  return { type: 'dock', payload: { bay } }
}

export function undockCommand(): CommandIntent<'undock'> {
  return { type: 'undock', payload: {} }
}

export function sellCargoCommand(resourceTier: OreSelection): CommandIntent<'sellCargo'> {
  return { type: 'sellCargo', payload: { resourceTier } }
}

export function repairHullCommand(): CommandIntent<'repairHull'> {
  return { type: 'repairHull', payload: {} }
}

export function rechargeEnergyCommand(): CommandIntent<'rechargeEnergy'> {
  return { type: 'rechargeEnergy', payload: {} }
}

export function quickServiceCommand(): CommandIntent<'quickService'> {
  return { type: 'quickService', payload: {} }
}

export function buyUpgradeCommand(upgradeId: string): CommandIntent<'buyUpgrade'> {
  return { type: 'buyUpgrade', payload: { upgradeId } }
}

export function buyCasingGradeCommand(): CommandIntent<'buyCasingGrade'> {
  return { type: 'buyCasingGrade', payload: {} }
}

export function buyGunCommand(): CommandIntent<'buyGun'> {
  return { type: 'buyGun', payload: {} }
}

export function queueRefineCommand(
  resourceTier: number,
  units: number,
): CommandIntent<'queueRefine'> {
  return { type: 'queueRefine', payload: { resourceTier, units } }
}

export function buyRefinerySlotCommand(): CommandIntent<'buyRefinerySlot'> {
  return { type: 'buyRefinerySlot', payload: {} }
}

export function collectRefinedCommand(): CommandIntent<'collectRefined'> {
  return { type: 'collectRefined', payload: {} }
}

export function travelCommand(toPlanet: number): CommandIntent<'travel'> {
  return { type: 'travel', payload: { toPlanet } }
}
