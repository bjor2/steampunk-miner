/**
 * The vehicle's command intents, as the store and the scenario runner submit them (#3: actions
 * that change the world submit a command). Money and hull travel as canonical strings.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { fromCanonical, toCanonical } from '../money'
import type { PosePayload } from './poseReport'
import type { BayId } from '../world/dockBays'

export function reportPoseCommand(payload: PosePayload): CommandIntent<'reportPose'> {
  return { type: 'reportPose', payload }
}

export function requestRescueCommand(): CommandIntent<'requestRescue'> {
  return { type: 'requestRescue', payload: {} }
}

/** The HUD toggle (#107); a mode that is not `auto` or `off` is refused by the authority. */
export function setGunModeCommand(mode: string): CommandIntent<'setGunMode'> {
  return { type: 'setGunMode', payload: { mode } }
}

/** Plants a charge on the wall the vehicle faces (#109); the authority checks rack, wall and fuse. */
export function plantChargeCommand(): CommandIntent<'plantCharge'> {
  return { type: 'plantCharge', payload: {} }
}

/** A scenario's mounted rack with `slotLevel` bought slots carrying `carried` charges (#109). */
export function setChargesCommand(
  carried: number,
  slotLevel: number,
): CommandIntent<'debug.setCharges'> {
  return { type: 'debug.setCharges', payload: { carried, slotLevel } }
}

export function setGunLevelCommand(level: number): CommandIntent<'debug.setGunLevel'> {
  return { type: 'debug.setGunLevel', payload: { level } }
}

export function setUpgradeCommand(
  upgradeId: string,
  level: number,
): CommandIntent<'debug.setUpgrade'> {
  return { type: 'debug.setUpgrade', payload: { upgradeId, level } }
}

export function setEnergyCommand(units: string): CommandIntent<'debug.setEnergy'> {
  return { type: 'debug.setEnergy', payload: { energy: units } }
}

/** A bay that is not `sell` or `upgrade` is passed on as written, so the authority names it. */
export function teleportToDockCommand(bay: BayId): CommandIntent<'debug.teleportToDock'> {
  return { type: 'debug.teleportToDock', payload: { bay } }
}

/** A malformed hull is passed on as written, so the authority names the problem. */
export function setHullCommand(hull: string): CommandIntent<'debug.setHull'> {
  return { type: 'debug.setHull', payload: { hull: canonicalOrAsWritten(hull) } }
}

function canonicalOrAsWritten(text: string): string {
  try {
    return toCanonical(fromCanonical(text))
  } catch {
    return text
  }
}
