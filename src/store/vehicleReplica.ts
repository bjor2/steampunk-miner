/**
 * What the UI renders of the local vehicle, copied from the authority (decision #3: the store is
 * a replica). Rebuilt only when the authority's vehicle object changes, so a tick that leaves the
 * vehicle alone gives the same replica and no subscriber re-renders.
 */
import { visualTier } from '../systems/economy/vehicleStats'
import { quantaOfUnits } from '../systems/vehicle/energyQuanta'
import {
  cargoUnitsOf,
  statsOfVehicle,
  type VehicleMode,
  type VehicleState,
} from '../systems/vehicle/vehicleState'
import type { Money } from '../systems/money'

export interface VehicleReplica {
  mode: VehicleMode
  /** Quanta of 1/240 unit (#11 amendment 2); the HUD divides for display. */
  energy: number
  energyMax: number
  hull: Money
  hullMax: Money
  cargoUnits: number
  cargoCapacity: number
  /** 1 to 3 from the upgrade levels (#7, #20): which placeholder parts the vehicle shows. */
  visualTier: number
  /** 0 with no guns; the turret and its barrel look follow it (#107). */
  gunLevel: number
}

let lastSource: VehicleState | null = null
let lastReplica: VehicleReplica | null = null

export function vehicleReplicaOf(vehicle: VehicleState): VehicleReplica {
  if (vehicle === lastSource && lastReplica !== null) return lastReplica
  const stats = statsOfVehicle(vehicle)
  lastSource = vehicle
  lastReplica = {
    mode: vehicle.mode,
    energy: vehicle.energy,
    energyMax: quantaOfUnits(stats.energyMax),
    hull: vehicle.hull,
    hullMax: stats.hullMax,
    cargoUnits: cargoUnitsOf(vehicle.cargo),
    cargoCapacity: stats.cargoCapacity,
    visualTier: visualTier(vehicle.levels),
    gunLevel: vehicle.gun.level,
  }
  return lastReplica
}
