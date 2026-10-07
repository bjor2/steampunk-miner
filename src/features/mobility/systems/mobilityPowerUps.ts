/**
 * Each mobility item as `power-up-core` runs it (#162 section 2.1 classes, section 4 numbers):
 * charged items refill at the dock, consumables come as a stack, the two toggles draw a share of
 * `energyMax` a second while on (#162 4.4, ticket 233). Marks take effect in play in a
 * `power-up-core` follow-up (GD lock on #204 Q7), so every use acts at its Mark 1 numbers.
 */
import type { PowerUp, PowerUpClass } from '../../power-up-core'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'
import { MOBILITY_ITEM_ROWS, type MobilityRow } from './mobilityCatalogue'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import {
  blowSteamBoost,
  burstSmokeCanister,
  dropBallast,
  fireEscapeThruster,
  fireGrapple,
  raiseSteamShield,
  startRivetPatch,
  switchToggle,
  ventHeatSink,
} from './mobilityUses'

type PowerUpRules = Pick<
  PowerUp,
  | 'powerUpClass'
  | 'charges'
  | 'cooldownTicks'
  | 'windupTicks'
  | 'isToggle'
  | 'energyDrawPerMillePerSecond'
  | 'activate'
>

const N = MOBILITY_ECONOMY

const RULES: Readonly<Record<MobilityItemId, PowerUpRules>> = {
  [MOBILITY_ITEM.grappleWinch]: charged(N.grapple, fireGrapple),
  [MOBILITY_ITEM.emergencyBallast]: consumable(N.ballast, dropBallast),
  [MOBILITY_ITEM.heatSinkFlask]: consumable(N.heatSink, ventHeatSink),
  [MOBILITY_ITEM.steamBoost]: charged(N.steamBoost, blowSteamBoost),
  [MOBILITY_ITEM.rivetPatch]: consumable(N.rivetPatch, startRivetPatch),
  [MOBILITY_ITEM.steamShield]: charged(N.steamShield, raiseSteamShield),
  [MOBILITY_ITEM.smokeCanister]: consumable(N.smoke, burstSmokeCanister),
  [MOBILITY_ITEM.gravAnchor]: toggle(N.gravAnchor.drawPerMillePerSecond),
  [MOBILITY_ITEM.buoyancyTanks]: toggle(N.buoyancy.drawPerMillePerSecond),
  [MOBILITY_ITEM.escapeThruster]: consumable(N.escapeThruster, fireEscapeThruster),
}

export const MOBILITY_POWER_UPS: readonly PowerUp[] = MOBILITY_ITEM_ROWS.map(powerUpOfRow)

function powerUpOfRow(row: MobilityRow): PowerUp {
  return {
    id: `mobility.${shortNameOf(row.itemId)}`,
    itemId: row.itemId,
    iconId: row.iconId,
    name: row.name,
    channelTicks: 0,
    ...RULES[row.itemId as MobilityItemId],
  }
}

/** `power.grapple_winch` is `grapple_winch`. */
function shortNameOf(itemId: string): string {
  return itemId.slice(itemId.indexOf('.') + 1)
}

function charged(
  numbers: { charges: number; cooldownTicks: number; windupTicks: number },
  activate: PowerUp['activate'],
): PowerUpRules {
  return rulesOf('charged', numbers.charges, numbers.cooldownTicks, numbers.windupTicks, activate)
}

function consumable(
  numbers: { stack: number; windupTicks: number },
  activate: PowerUp['activate'],
): PowerUpRules {
  return rulesOf('consumable', numbers.stack, 0, numbers.windupTicks, activate)
}

function toggle(drawPerMillePerSecond: number): PowerUpRules {
  return {
    ...rulesOf('passive', 0, 0, 0, switchToggle),
    isToggle: true,
    energyDrawPerMillePerSecond: drawPerMillePerSecond,
  }
}

function rulesOf(
  powerUpClass: PowerUpClass,
  charges: number,
  cooldownTicks: number,
  windupTicks: number,
  activate: PowerUp['activate'],
): PowerUpRules {
  return {
    powerUpClass,
    charges,
    cooldownTicks,
    windupTicks,
    isToggle: false,
    energyDrawPerMillePerSecond: 0,
    activate,
  }
}
