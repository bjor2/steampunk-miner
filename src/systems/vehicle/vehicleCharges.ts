/**
 * The vehicle's blasting charges (spec #109): the rack, bolted on by the first charge buy at the
 * Upgrade bay, its bought slots, the charges it carries and the one live charge it has planted.
 * The rack is not a vehicle track, so it never moves the visual tier.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { rackCapacity } from '../economy/blastingCharges'
import type { TilePoint } from '../world/tileGrid'

const HALF_TILE_MM = MM_PER_METRE / 2

/** A charge on the wall: its tile, and the tick its fuse blows. */
export interface PlantedCharge {
  tx: number
  ty: number
  detonateTick: number
}

export interface VehicleCharges {
  isRackMounted: boolean
  /** Rack slots bought past the rack's start size, 0 to 5. */
  slotLevel: number
  carried: number
  /** One live charge per vehicle at a time; null when none is planted. */
  planted: PlantedCharge | null
}

export const NO_CHARGES: VehicleCharges = {
  isRackMounted: false,
  slotLevel: 0,
  carried: 0,
  planted: null,
}

export function rackCapacityOf(charges: VehicleCharges): number {
  return rackCapacity(charges.slotLevel)
}

/** Charges a restock adds: the empty slots of the rack. */
export function emptyRackSlotsOf(charges: VehicleCharges): number {
  return rackCapacityOf(charges) - charges.carried
}

export function hasChargeToPlant(charges: VehicleCharges): boolean {
  return charges.carried > 0 && charges.planted === null
}

/** The centre of a charge's tile in mm: the blast and the fuse warning measure from it. */
export function chargeCentreMm(charge: TilePoint): { xMm: number; yMm: number } {
  return {
    xMm: charge.tx * MM_PER_METRE + HALF_TILE_MM,
    yMm: charge.ty * MM_PER_METRE + HALF_TILE_MM,
  }
}
