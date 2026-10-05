/**
 * The vehicle's command intents, as the store and the scenario runner submit them (#3: actions
 * that change the world submit a command). Money and hull travel as canonical strings.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { fromCanonical, toCanonical } from '../money'
import type { PosePayload } from './poseReport'

export function reportPoseCommand(payload: PosePayload): CommandIntent<'reportPose'> {
  return { type: 'reportPose', payload }
}

export function requestRescueCommand(): CommandIntent<'requestRescue'> {
  return { type: 'requestRescue', payload: {} }
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

export function teleportToDockCommand(): CommandIntent<'debug.teleportToDock'> {
  return { type: 'debug.teleportToDock', payload: {} }
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
