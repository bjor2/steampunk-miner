/**
 * One player's vehicle as the authority holds it (decisions #7 and #3: `players[id].vehicle`).
 * The save holds integer levels and the casing grade, never stats; energy is an integer count of 1/240-unit quanta
 * (#11 amendment 2), hull a BigStat, cargo whole units (1 ore tile = 1 unit at any tier, #7; core
 * fragments share the capacity, #10). The pose is the last accepted `reportPose`.
 */
import {
  startLevels,
  vehicleStatsAt,
  type UpgradeLevels,
  type VehicleStats,
} from '../economy/vehicleStats'
import { casingGradeStart } from '../economy/casingPrices'
import { ZERO_MONEY, type BigStat, type Money } from '../money'
import type { DockSite } from '../world/dockSite'
import { EMPTY_CASING_TRAIL, type CasingTrail } from './casingTrail'
import { NO_CHARGES, type VehicleCharges } from './vehicleCharges'
import { quantaOfUnits } from './energyQuanta'
import { STANDARD_LINING, type VehicleLining } from './liningType'
import { coldHeatAt, type VehicleHeat } from './vehicleHeat'
import { NO_GUN, type VehicleGun } from './vehicleGun'
import { dockedPoseAt, type VehiclePose } from './vehiclePose'

/** The #7 state machine; `docked` is entered by the rescue tow here and by docking in #23. */
export const VEHICLE_MODES = ['docked', 'active', 'stranded', 'destroyed'] as const

export type VehicleMode = (typeof VEHICLE_MODES)[number]

export interface Cargo {
  /** Units held per ore tier, keyed by the tier written as a decimal integer. */
  ore: Readonly<Record<string, number>>
  coreFragments: number
}

export interface VehicleState {
  mode: VehicleMode
  /** The tick the current mode began; the strand grace and the destroy delay count from it. */
  modeSinceTick: number
  levels: UpgradeLevels
  /**
   * The casing grade (#41): the player's own vertical counter next to the six tracks, never one
   * of them, so it is not in the visual-tier sum. Raised one at a time at the Upgrade bay.
   */
  casingGrade: number
  /**
   * The band (6 for the core) the vehicle last reported itself in while its casing grade did not
   * hold it, or null when it does (#41): the edge of `casing_grade_insufficient` and the amber badge.
   */
  casingShortBand: number | null
  /** The drill's recorded axis points still waiting for their casing ring (#41, #56). */
  casingTrail: CasingTrail
  /** The lining type the rings are laid in and the types unlocked (#113). */
  lining: VehicleLining
  /** The `auto_guns` turret (#107): not a vehicle track, so it is not in the visual-tier sum. */
  gun: VehicleGun
  /**
   * First-place lining charged and not yet paid or forgiven (#76 amendment, #115): it is settled
   * at the Sell bay out of the visit's payouts (#128), so nothing leaves the wallet mid-dive.
   */
  liningBill: Money
  /**
   * What this Sell bay visit's payouts have paid of the bill so far, or null before the first one
   * (#128): leaving the bay after a payout forgives the rest; leaving before one carries it.
   */
  liningPaidThisVisit: Money | null
  /** The charge rack and the charges it carries (#109), not a vehicle track. */
  charges: VehicleCharges
  energy: number
  hull: BigStat
  cargo: Cargo
  pose: VehiclePose | null
  /** The tick up to which drive, thrust and drill ticks have been charged (#11 amendment 2). */
  accountedTick: number
  /** The `energy_low` percents already logged since the tank was last above them. */
  energyLowLogged: readonly number[]
  /** The heat gauge (#113): 0 off the heat planets. */
  heat: VehicleHeat
}

export const EMPTY_CARGO: Cargo = { ore: {}, coreFragments: 0 }

/** A fresh vehicle: level 0 on every track, full tank and hull, empty hold, on the dock point. */
export function newVehicleState(site: DockSite | null, tick: number): VehicleState {
  const levels = startLevels()
  const stats = vehicleStatsAt(levels)
  return {
    mode: 'active',
    modeSinceTick: tick,
    levels,
    casingGrade: casingGradeStart(),
    casingShortBand: null,
    casingTrail: EMPTY_CASING_TRAIL,
    lining: STANDARD_LINING,
    gun: NO_GUN,
    liningBill: ZERO_MONEY,
    liningPaidThisVisit: null,
    charges: NO_CHARGES,
    energy: quantaOfUnits(stats.energyMax),
    hull: stats.hullMax,
    cargo: EMPTY_CARGO,
    pose: site === null ? null : dockedPoseAt(site),
    accountedTick: tick,
    energyLowLogged: [],
    heat: coldHeatAt(tick),
  }
}

export function statsOfVehicle(vehicle: VehicleState): VehicleStats {
  return vehicleStatsAt(vehicle.levels)
}

export function energyMaxQuantaOf(vehicle: VehicleState): number {
  return quantaOfUnits(statsOfVehicle(vehicle).energyMax)
}

export function cargoUnitsOf(cargo: Cargo): number {
  return Object.values(cargo.ore).reduce((total, units) => total + units, cargo.coreFragments)
}

export function hasCargoRoom(vehicle: VehicleState): boolean {
  return cargoUnitsOf(vehicle.cargo) < statsOfVehicle(vehicle).cargoCapacity
}

export function withOreUnit(cargo: Cargo, tier: number): Cargo {
  const key = String(tier)
  return { ...cargo, ore: { ...cargo.ore, [key]: (cargo.ore[key] ?? 0) + 1 } }
}

export function isVehicleActive(vehicle: VehicleState): boolean {
  return vehicle.mode === 'active'
}
