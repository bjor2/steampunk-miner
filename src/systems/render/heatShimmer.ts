/**
 * How strongly the vehicle shimmers with heat (#113 Visibility: "a heat shimmer on the body above
 * `throttleAt`", the #51 `fx-heat-shimmer` row): 0 up to the throttle line, rising to 1 at the
 * gauge's max, and 0 off the heat planets. The shader draws the haze; this says how much.
 */
import { hazardArchetypeOn } from '../economy/heatEconomy'
import { heatUnitsOfPoints, type VehicleHeat } from '../vehicle/vehicleHeat'

export function heatShimmerStrength(planetIndex: number, heat: VehicleHeat): number {
  const archetype = hazardArchetypeOn(planetIndex)
  if (archetype === null) return 0
  const line = heatUnitsOfPoints(archetype.throttleAt)
  const max = heatUnitsOfPoints(archetype.gaugeMax)
  return Math.min(1, Math.max(0, (heat.level - line) / (max - line)))
}
