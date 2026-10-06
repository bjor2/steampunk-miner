import { describe, expect, it } from 'vitest'
import { coldHeatAt, heatUnitsOfPoints } from '../vehicle/vehicleHeat'
import { heatShimmerStrength } from './heatShimmer'

const at = (points: number) => ({ ...coldHeatAt(0), level: heatUnitsOfPoints(points) })

describe('heat shimmer (#113)', () => {
  it('shows nothing up to the throttle line and rises to full at the gauge max', () => {
    expect([0, 70, 85, 100].map((points) => heatShimmerStrength(8, at(points)))).toEqual([
      0, 0, 0.5, 1,
    ])
  })

  it('never shows off the heat planets', () => {
    expect(heatShimmerStrength(7, at(100))).toBe(0)
  })
})
