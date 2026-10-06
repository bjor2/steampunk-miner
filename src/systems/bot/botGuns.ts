/**
 * The pacing bot and `auto_guns` (#107 "Bot policy"): it mounts the guns at the Upgrade bay as
 * soon as they are offered (planet 4) and it can pay, and keeps them on Auto, switching them Off
 * while the tank is under 40% so the rest goes to drilling and the way home. It buys no gun levels
 * past the mount; the policy names none.
 */
import { gunOf, isGunOffered, nextGunPriceOf } from '../authority/gunRules'
import type { Money } from '../money'
import { setGunModeCommand } from '../vehicle/vehicleCommands'
import { mountedGunModeOf, type GunMode } from '../vehicle/vehicleGun'
import { energyMaxQuantaOf, type VehicleState } from '../vehicle/vehicleState'
import type { BotSession } from './botSession'

/** Whether the bot buys guns at all; a comparison run plays without them (#107 acceptance 5). */
export type GunPolicy = 'mount' | 'never'

const GUNS_OFF_BELOW_PERCENT = 40

/** The mount, while it is offered here and not yet bought; null otherwise. */
export function gunMountPriceFor(session: BotSession, policy: GunPolicy): Money | null {
  const state = session.state()
  const isWanted = policy === 'mount' && gunOf(state, session.playerId).level === 0
  if (!isWanted || !isGunOffered(state, session.playerId)) return null
  return nextGunPriceOf(state, session.playerId)
}

/** Auto with 40% or more in the tank, Off under it; nothing with no guns mounted. */
export function setGunsForEnergy(session: BotSession): void {
  const vehicle = session.vehicle()
  const mode = mountedGunModeOf(vehicle.gun)
  const wanted = gunModeForEnergy(vehicle)
  if (mode !== null && mode !== wanted) session.submit(setGunModeCommand(wanted))
}

function gunModeForEnergy(vehicle: VehicleState): GunMode {
  const isLow = vehicle.energy * 100 < energyMaxQuantaOf(vehicle) * GUNS_OFF_BELOW_PERCENT
  return isLow ? 'off' : 'auto'
}
