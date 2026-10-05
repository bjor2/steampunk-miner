/**
 * The platform's command intents (decision #8 registered commands, #23), as the store submits
 * them: `Dock`, `Undock`, `SellCargo {resourceTier | all}`, `RepairHull`, `RechargeEnergy`,
 * `QuickService` and `BuyUpgrade {upgradeId}`. The authority checks and prices each one.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { OreSelection } from '../authority/platformServices'

export function dockCommand(): CommandIntent<'dock'> {
  return { type: 'dock', payload: {} }
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
