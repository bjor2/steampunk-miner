/**
 * Each mobility item as `power-up-core` runs it (#162 section 2.1 classes, section 4 numbers):
 * charged items refill at the dock, consumables come as a stack, the two toggles draw a share of
 * `energyMax` a second while on (#162 4.4, ticket 233). These are the Mark 1 numbers: power-up-core
 * steps them with each item's ladder at the Mark researched (#249, GD lock on #204 Q7). Each item
 * plays its plain use, its Mark milestone second tap and hold, and the use a sibling-link fires
 * (ticket 275, `useVerbs.ts`).
 */
import type { PowerUp, PowerUpClass } from '../../power-up-core'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'
import { MOBILITY_ITEM_ROWS, type MobilityRow } from './mobilityCatalogue'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import {
  addPlateToPatch,
  airDashSteamBoost,
  aimEscapeThruster,
  burnEscapeLonger,
  burnSteamBoostLonger,
  chainHeatSink,
  driftOnTanks,
  fireGrappleAtNextAnchor,
  fireGrappleReelingFast,
  hopOnBallast,
  jetHeatSink,
  keepBallastLonger,
  keepShieldLonger,
  keepSmokeLonger,
  kickOffAnchor,
  pinWithAnchor,
  raiseCoolingCurtain,
  riseOnTanks,
  throwSmokeAhead,
} from './followUpUses'
import {
  dropLinkedBallast,
  puffLinkedSmoke,
  raiseLinkedShield,
  startLinkedPatch,
} from './linkedUses'
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
import { rivetHoldOf } from './rivetPatch'
import { playingVerbs, type UseVerbs } from './useVerbs'

type PowerUpRules = Pick<
  PowerUp,
  | 'powerUpClass'
  | 'charges'
  | 'cooldownTicks'
  | 'windupTicks'
  | 'isToggle'
  | 'energyDrawBpPerSecond'
  | 'activate'
  | 'holdOf'
  | 'linkMoment'
>

const N = MOBILITY_ECONOMY

const RULES: Readonly<Record<MobilityItemId, PowerUpRules>> = {
  [MOBILITY_ITEM.grappleWinch]: charged(N.grapple, {
    plain: fireGrapple,
    secondTap: fireGrappleAtNextAnchor,
    hold: fireGrappleReelingFast,
  }),
  [MOBILITY_ITEM.emergencyBallast]: consumable(N.ballast, {
    plain: dropBallast,
    secondTap: hopOnBallast,
    hold: keepBallastLonger,
    linked: dropLinkedBallast,
  }),
  [MOBILITY_ITEM.heatSinkFlask]: consumable(N.heatSink, {
    plain: ventHeatSink,
    secondTap: jetHeatSink,
    hold: chainHeatSink,
  }),
  [MOBILITY_ITEM.steamBoost]: charged(N.steamBoost, {
    plain: blowSteamBoost,
    secondTap: airDashSteamBoost,
    hold: burnSteamBoostLonger,
  }),
  [MOBILITY_ITEM.rivetPatch]: {
    ...consumable(N.rivetPatch, {
      plain: startRivetPatch,
      secondTap: addPlateToPatch,
      linked: startLinkedPatch,
    }),
    holdOf: rivetHoldOf,
  },
  // The curtain's break, not its raise, fires its smoke puff (the GD lock on #256).
  [MOBILITY_ITEM.steamShield]: {
    ...charged(N.steamShield, {
      plain: raiseSteamShield,
      secondTap: raiseCoolingCurtain,
      hold: keepShieldLonger,
      linked: raiseLinkedShield,
    }),
    linkMoment: 'own',
  },
  [MOBILITY_ITEM.smokeCanister]: consumable(N.smoke, {
    plain: burstSmokeCanister,
    secondTap: throwSmokeAhead,
    hold: keepSmokeLonger,
    linked: puffLinkedSmoke,
  }),
  [MOBILITY_ITEM.gravAnchor]: toggle(N.gravAnchor.drawBpPerSecond, {
    plain: switchToggle,
    hold: pinWithAnchor,
    secondTap: kickOffAnchor,
  }),
  [MOBILITY_ITEM.buoyancyTanks]: toggle(N.buoyancy.drawBpPerSecond, {
    plain: switchToggle,
    hold: riseOnTanks,
    secondTap: driftOnTanks,
  }),
  [MOBILITY_ITEM.escapeThruster]: consumable(N.escapeThruster, {
    plain: fireEscapeThruster,
    secondTap: aimEscapeThruster,
    hold: burnEscapeLonger,
  }),
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
  verbs: UseVerbs,
): PowerUpRules {
  const { charges, cooldownTicks, windupTicks } = numbers
  return rulesOf('charged', charges, cooldownTicks, windupTicks, playingVerbs(verbs))
}

function consumable(
  numbers: { stack: number; windupTicks: number },
  verbs: UseVerbs,
): PowerUpRules {
  return rulesOf('consumable', numbers.stack, 0, numbers.windupTicks, playingVerbs(verbs))
}

function toggle(drawBpPerSecond: number, verbs: UseVerbs): PowerUpRules {
  return {
    ...rulesOf('passive', 0, 0, 0, playingVerbs(verbs)),
    isToggle: true,
    energyDrawBpPerSecond: drawBpPerSecond,
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
    energyDrawBpPerSecond: 0,
    activate,
  }
}
