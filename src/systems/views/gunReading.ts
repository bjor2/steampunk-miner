/**
 * The HUD's guns readout (#107 design): the mode with the toggle's key, "Auto (G)" or "Off (G)",
 * shown only while guns are mounted (#90: nothing before), and the "guns idle: low steam" badge
 * while they are on Auto but the rescue floor holds them back. Text says it, never colour alone.
 */
import { boundLabel, type Bindings } from '../input/actionMap'
import { isGunIdleForSteam, mountedGunModeOf, type GunMode } from '../vehicle/vehicleGun'
import type { VehicleState } from '../vehicle/vehicleState'

export interface GunReading {
  mode: GunMode
  text: string
  isIdle: boolean
  idleText: string
}

const MODE_TEXTS: Readonly<Record<GunMode, string>> = { auto: 'Auto', off: 'Off' }

export const GUN_IDLE_TEXT = 'guns idle: low steam'

/** Null with no guns mounted. */
export function gunReadingOf(vehicle: VehicleState, bindings: Bindings): GunReading | null {
  const mode = mountedGunModeOf(vehicle.gun)
  if (mode === null) return null
  const isIdle = isGunIdleForSteam(vehicle)
  return {
    mode,
    text: `${MODE_TEXTS[mode]} (${boundLabel(bindings, 'toggle_guns')})`,
    isIdle,
    idleText: isIdle ? GUN_IDLE_TEXT : '',
  }
}
