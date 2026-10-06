import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { onCurveLevels, startLevels } from '../economy/vehicleStats'
import { firstBandDigTicks } from './firstBandDig'

describe('first band dig time (#86)', () => {
  it('digs planet 1 band 1 in the drill rule time of the start vehicle, 40 ticks a metre', () => {
    expect(firstBandDigTicks(1, startLevels())).toBe(40)
  })

  it('reads the tip and power of the levels it is given', () => {
    expect(firstBandDigTicks(1, onCurveLevels(1))).toBe(ECONOMY.drill.minTicksPerTile)
  })

  it('answers null when the tip only skids on the band', () => {
    expect(firstBandDigTicks(5, startLevels())).toBeNull()
  })
})
