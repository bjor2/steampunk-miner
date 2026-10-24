/**
 * The platform's command intents (decision #8 registered commands, #23), as the store submits
 * them: `Dock {bay}`, `Undock`, `SellCargo {resourceTier | all}`, `RepairHull`, `RechargeEnergy`,
 * `QuickService`, `BuyUpgrade {upgradeId}`, `BuyCasingGrade`, `BuyGun` (#107), `BuyLiningType` and
 * `SelectLiningType` (#113), `Travel {toPlanet}`
 * (#10), and the Refinery bay's `QueueRefine`, `BuyRefinerySlot` and the Sell bay's
 * `CollectRefined` (#105), the Upgrade bay's `RestockCharges` and `BuyChargeRackSlot` (#109), and
 * the star map's `BuyFuel` and `JumpToPlanet` (ticket 755), `BuyFuelTank` (ticket 756) and
 * `BuyJumpDrive` (ticket 759). The authority checks and prices each one.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { toIndexText } from '../starMap/planetAddress'
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

/** `chain` is 0 for a click, else the hold the step belongs to (`purchaseChain.ts`). */
export function buyUpgradeCommand(upgradeId: string, chain: number): CommandIntent<'buyUpgrade'> {
  return { type: 'buyUpgrade', payload: { upgradeId, chain } }
}

export function buyCasingGradeCommand(chain: number): CommandIntent<'buyCasingGrade'> {
  return { type: 'buyCasingGrade', payload: { chain } }
}

export function buyGunCommand(chain: number): CommandIntent<'buyGun'> {
  return { type: 'buyGun', payload: { chain } }
}

/** Buys `count` charges of `size` (K8 #218): refused, never trimmed, if they do not fit the rack. */
export function restockChargesCommand(
  size: number,
  count: number,
): CommandIntent<'restockCharges'> {
  return { type: 'restockCharges', payload: { size, count } }
}

export function buyChargeRackSlotCommand(chain: number): CommandIntent<'buyChargeRackSlot'> {
  return { type: 'buyChargeRackSlot', payload: { chain } }
}

export function buyLiningTypeCommand(liningType: string): CommandIntent<'buyLiningType'> {
  return { type: 'buyLiningType', payload: { liningType } }
}

export function selectLiningTypeCommand(liningType: string): CommandIntent<'selectLiningType'> {
  return { type: 'selectLiningType', payload: { liningType } }
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

export function buyFuelCommand(units: number): CommandIntent<'buyFuel'> {
  return { type: 'buyFuel', payload: { units } }
}

export function buyFuelTankCommand(): CommandIntent<'buyFuelTank'> {
  return { type: 'buyFuelTank', payload: {} }
}

export function buyJumpDriveCommand(): CommandIntent<'buyJumpDrive'> {
  return { type: 'buyJumpDrive', payload: {} }
}

/** The star map's jump (ticket 755) to planet `planet` of system `system`. */
export function jumpToPlanetCommand(system: bigint, planet: bigint): CommandIntent<'jumpToPlanet'> {
  return {
    type: 'jumpToPlanet',
    payload: { system: toIndexText(system), planet: toIndexText(planet) },
  }
}
