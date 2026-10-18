import { describe, expect, it } from 'vitest'
import { onCurveSteps, startLevels } from '../economy/vehicleStats'
import { bandDigTicks } from './bandDig'

describe('band dig time (#86)', () => {
  it('digs planet 1 band 1 in the drill rule time of the start vehicle, 40 ticks a metre', () => {
    expect(bandDigTicks(1, startLevels(), 1)).toBe(40)
  })

  it('reads the tip and power of the levels it is given: ceil(60 / (1.5 x 1.12^(1/18) x 1.243^11)) = 4', () => {
    expect(bandDigTicks(1, onCurveSteps(1), 1)).toBe(4)
  })

  it('answers null when the tip only skids on the band', () => {
    expect(bandDigTicks(5, startLevels(), 1)).toBeNull()
  })

  it('judges band 5 when no band is given, the home band of the sawtooth', () => {
    expect(bandDigTicks(2, onCurveSteps(1))).toBe(bandDigTicks(2, onCurveSteps(1), 5))
  })

  // #552's on-curve drill: 15 purchases on arrival at planet 3, 18 by departure.
  it('digs band 5 on curve in 19 ticks a metre on arrival and 10 by departure', () => {
    expect(bandDigTicks(3, onCurveSteps(2))).toBe(19)
    expect(bandDigTicks(3, onCurveSteps(3))).toBe(10)
  })
})
