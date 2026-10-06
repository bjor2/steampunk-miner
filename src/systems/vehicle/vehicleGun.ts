/**
 * The vehicle's `auto_guns` turret (#107 design): its level (0 before the mount, 1 once mounted,
 * up to the gun track's cap) and the HUD toggle. The guns start on Auto when mounted; Off saves the
 * boiler for drilling. Part of the vehicle, so it is saved and travels with the vehicle.
 */
import { gunMountLevel } from '../economy/gunStats'
import { GUN_SHOT_QUANTA, rescueFloorQuanta } from './energyQuanta'
import type { VehicleState } from './vehicleState'

export const GUN_MODES = ['auto', 'off'] as const

export type GunMode = (typeof GUN_MODES)[number]

export interface VehicleGun {
  level: number
  mode: GunMode
}

export const NO_GUN: VehicleGun = { level: 0, mode: 'auto' }

export function isGunMounted(gun: VehicleGun): boolean {
  return gun.level >= gunMountLevel()
}

export function isGunMode(value: unknown): value is GunMode {
  return (GUN_MODES as readonly unknown[]).includes(value)
}

/** What the HUD toggle switches to. */
export function toggledGunMode(mode: GunMode): GunMode {
  return mode === 'auto' ? 'off' : 'auto'
}

/** The mode the HUD toggle switches from, or null with no guns mounted. */
export function mountedGunModeOf(gun: VehicleGun): GunMode | null {
  return isGunMounted(gun) ? gun.mode : null
}

export function isGunOnAuto(gun: VehicleGun): boolean {
  return isGunMounted(gun) && gun.mode === 'auto'
}

/** A shot leaves the tank at or above the rescue floor: the guns never strand the player (#107). */
export function hasSteamForShot(vehicle: VehicleState): boolean {
  return vehicle.energy - GUN_SHOT_QUANTA >= rescueFloorQuanta(vehicle.levels.boiler)
}

/** On Auto but held back by the rescue floor: the HUD's "guns idle: low steam" badge (#107). */
export function isGunIdleForSteam(vehicle: VehicleState): boolean {
  return isGunOnAuto(vehicle.gun) && !hasSteamForShot(vehicle)
}
