/**
 * The vehicle's blasting charges (spec #109, sizes K8 #218): the rack, bolted on by the first charge
 * buy at the Upgrade bay, its bought slots, the charges it carries of each size and the one live
 * charge it has planted. A charge of size n takes `rackSlotsOf(n)` slots, and the carried charges'
 * slots never pass the rack's capacity (`sum(count * rackSlots(size)) <= capacity`, the TD lock on
 * #149). The rack is not a vehicle track, so it never moves the visual tier.
 *
 * The Blast Radius level (D9 #869) is the planter's, not a charge's: every blast reads the level
 * owned when it blows, so a charge bought before a level is never stranded at the old radius.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { rackCapacity } from '../economy/blastingCharges'
import { rackSlotsOf } from '../economy/chargeSizes'
import type { TilePoint } from '../world/tileGrid'

const HALF_TILE_MM = MM_PER_METRE / 2

/** A charge on the wall: its tile, its size, when it was planted and the tick its fuse blows. */
export interface PlantedCharge {
  tx: number
  ty: number
  size: number
  plantedTick: number
  /** Null for a remote charge (sizes 7 to 12): only the plunger fires it (#149). */
  detonateTick: number | null
}

/** Charges carried by size, keyed `"1"` to `"12"`; a size with none has no key. */
export type CarriedBySize = Readonly<Record<string, number>>

export interface VehicleCharges {
  isRackMounted: boolean
  /** Rack slots bought past the rack's start size, 0 to 5. */
  slotLevel: number
  carriedBySize: CarriedBySize
  /** One live charge per vehicle at a time; null when none is planted. */
  planted: PlantedCharge | null
  /**
   * Blast Radius levels bought (D9 #869), uncapped; absent at 0, so a rig that never bought one
   * saves and digests as before.
   */
  radiusLevel?: number
}

export const NO_CHARGES: VehicleCharges = {
  isRackMounted: false,
  slotLevel: 0,
  carriedBySize: {},
  planted: null,
}

/** The rack's slots: its start size plus the bought ones. */
export function rackCapacityOf(charges: VehicleCharges): number {
  return rackCapacity(charges.slotLevel)
}

/** The Blast Radius level the rig owns: every blast it sets off reads it (D9 #869). */
export function blastRadiusLevelOf(charges: Pick<VehicleCharges, 'radiusLevel'>): number {
  return charges.radiusLevel ?? 0
}

/** The charges at Blast Radius `level`, the key dropped at 0. */
export function withBlastRadiusLevel(charges: VehicleCharges, level: number): VehicleCharges {
  const { radiusLevel: _held, ...rest } = charges
  return level > 0 ? { ...rest, radiusLevel: level } : rest
}

/** Whether a saved Blast Radius level is a whole level from 1, or left out. */
export function isPortableBlastRadiusLevel(level: unknown): boolean {
  if (level === undefined) return true
  return Number.isSafeInteger(level) && (level as number) > 0
}

export function carriedOf(charges: VehicleCharges, size: number): number {
  return charges.carriedBySize[String(size)] ?? 0
}

/** Every charge in the rack, whatever its size. */
export function totalCarriedOf(charges: VehicleCharges): number {
  return Object.values(charges.carriedBySize).reduce((total, count) => total + count, 0)
}

/** The sizes the rack holds at least one of, smallest first. */
export function carriedSizesOf(charges: VehicleCharges): number[] {
  return Object.keys(charges.carriedBySize).map((size) => Number.parseInt(size, 10))
}

export function rackSlotsUsedOf(charges: VehicleCharges): number {
  return Object.entries(charges.carriedBySize).reduce(
    (used, [size, count]) => used + count * rackSlotsOf(Number.parseInt(size, 10)),
    0,
  )
}

export function freeRackSlotsOf(charges: VehicleCharges): number {
  return rackCapacityOf(charges) - rackSlotsUsedOf(charges)
}

/** How many more charges of `size` fit the rack's free slots. */
export function chargesThatFitOf(charges: VehicleCharges, size: number): number {
  return Math.floor(freeRackSlotsOf(charges) / rackSlotsOf(size))
}

/** Whether `count` more charges of `size` fit the rack's free slots. */
export function doChargesFit(charges: VehicleCharges, size: number, count: number): boolean {
  return count * rackSlotsOf(size) <= freeRackSlotsOf(charges)
}

/**
 * The rack with `count` charges of `size`, the other sizes as they were. Size keys are integer
 * keys, which every object lists in ascending order, so equal racks serialise and digest alike.
 */
export function withCarried(charges: VehicleCharges, size: number, count: number): VehicleCharges {
  const carriedBySize: Record<string, number> = { ...charges.carriedBySize, [String(size)]: count }
  if (count === 0) delete carriedBySize[String(size)]
  return { ...charges, carriedBySize }
}

/** The centre of a charge's tile in mm: the blast and the fuse warning measure from it. */
export function chargeCentreMm(charge: TilePoint): { xMm: number; yMm: number } {
  return {
    xMm: charge.tx * MM_PER_METRE + HALF_TILE_MM,
    yMm: charge.ty * MM_PER_METRE + HALF_TILE_MM,
  }
}
