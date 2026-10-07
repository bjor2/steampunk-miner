/**
 * Which charge size `plant_charge` plants (#153: one rack, one verb; `next_charge_size`, KeyV, steps
 * the size; K8 #218). The player's chosen size is plain UI state, never authority state: the plant
 * command names the size it plants. The chosen size plants while the rack holds one; once it runs
 * out, the rack's smallest size does, so a press always plants what the rack carries.
 */
import { carriedOf, carriedSizesOf, type VehicleCharges } from './vehicleCharges'

/** The size a press of `plant_charge` plants now. */
export function chargeSizeToPlantOf(charges: VehicleCharges, chosenSize: number): number {
  if (carriedOf(charges, chosenSize) > 0) return chosenSize
  return carriedSizesOf(charges)[0] ?? chosenSize
}

/** The next size the rack holds after the one a press would plant, wrapping; null with one size. */
export function nextChargeSizeOf(charges: VehicleCharges, chosenSize: number): number | null {
  const sizes = carriedSizesOf(charges)
  if (sizes.length < 2) return null
  const planting = chargeSizeToPlantOf(charges, chosenSize)
  return sizes.find((size) => size > planting) ?? sizes[0]
}
