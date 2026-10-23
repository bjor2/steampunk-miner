import { describe, expect, it } from 'vitest'
import { onCurveSteps, startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { bandDigTicks, bandSidewaysTicks } from './bandDig'

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

// #723's drive-bound law (Game Director on #762): a sideways metre takes the slower of the drill and
// the drive.
describe('band sideways time (#762)', () => {
  it('cuts sideways at the drill time where the drill is slower than the drive: 40 ticks on the start vehicle', () => {
    expect(bandSidewaysTicks(1, startLevels(), 1)).toBe(40)
  })

  it('cuts sideways at the drive time where the drill would cut faster: 60 / speedMax ticks a metre', () => {
    const levels = onCurveSteps(1)
    const driveTicks = 60 / vehicleStatsAt(levels).engine.speedMax
    expect(bandDigTicks(1, levels)).toBeLessThan(driveTicks)
    expect(bandSidewaysTicks(1, levels)).toBe(driveTicks)
  })

  it('answers null where the tip only skids, as the cut down does', () => {
    expect(bandSidewaysTicks(5, startLevels(), 1)).toBeNull()
  })
})
