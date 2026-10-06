import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { onCurveLevels, startLevels } from '../economy/vehicleStats'
import { bandDigTicks } from './bandDig'

describe('band dig time (#86)', () => {
  it('digs planet 1 band 1 in the drill rule time of the start vehicle, 40 ticks a metre', () => {
    expect(bandDigTicks(1, startLevels(), 1)).toBe(40)
  })

  it('reads the tip and power of the levels it is given', () => {
    expect(bandDigTicks(1, onCurveLevels(1), 1)).toBe(ECONOMY.drill.minTicksPerTile)
  })

  it('answers null when the tip only skids on the band', () => {
    expect(bandDigTicks(5, startLevels(), 1)).toBeNull()
  })

  it('judges band 5 when no band is given, the home band of the sawtooth', () => {
    expect(bandDigTicks(2, onCurveLevels(1))).toBe(bandDigTicks(2, onCurveLevels(1), 5))
  })

  it('digs band 5 on curve in 45 ticks a metre on arrival and at the cap by departure', () => {
    expect(bandDigTicks(3, onCurveLevels(2))).toBe(45)
    expect(bandDigTicks(3, onCurveLevels(3))).toBe(ECONOMY.drill.minTicksPerTile)
  })
})
