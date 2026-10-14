import { describe, expect, it } from 'vitest'
import {
  burstPhaseOf,
  gunIntervalAt,
  isBurstOn,
  switchedOffBurst,
  switchedOnBurst,
  type BurstCycle,
} from './gunBurst'

/** Content's Overpressure on #319: 120 ticks at two thirds of the interval, then a 300-tick vent. */
const OVERPRESSURE: BurstCycle = {
  burstTicks: 120,
  ventTicks: 300,
  intervalNumerator: 2,
  intervalDenominator: 3,
}

describe('gun burst (ticket 383)', () => {
  it('bursts from the tick the toggle goes on, vents after burstTicks, and bursts again', () => {
    const burst = switchedOnBurst(undefined, OVERPRESSURE, 1000)
    expect(isBurstOn(burst)).toBe(true)
    expect(burstPhaseOf(burst, 1000)).toBe('burst')
    expect(burstPhaseOf(burst, 1119)).toBe('burst')
    expect(burstPhaseOf(burst, 1120)).toBe('vent')
    expect(burstPhaseOf(burst, 1419)).toBe('vent')
    expect(burstPhaseOf(burst, 1420)).toBe('burst')
  })

  it('is neither bursting nor venting before the first switch', () => {
    expect(burstPhaseOf(undefined, 1000)).toBe('none')
    expect(isBurstOn(undefined)).toBe(false)
  })

  it('vents in full from the tick a burst is switched off, then fires as the track does', () => {
    const off = switchedOffBurst(switchedOnBurst(undefined, OVERPRESSURE, 1000), 1050)
    expect(isBurstOn(off)).toBe(false)
    expect(burstPhaseOf(off, 1050)).toBe('vent')
    expect(burstPhaseOf(off, 1349)).toBe('vent')
    expect(burstPhaseOf(off, 1350)).toBe('none')
  })

  it('lets a vent under way run out when switched off during it', () => {
    const off = switchedOffBurst(switchedOnBurst(undefined, OVERPRESSURE, 1000), 1200)
    expect(burstPhaseOf(off, 1419)).toBe('vent')
    expect(burstPhaseOf(off, 1420)).toBe('none')
  })

  it('starts the next burst when the vent ends if switched on again during it', () => {
    const off = switchedOffBurst(switchedOnBurst(undefined, OVERPRESSURE, 1000), 1050)
    const again = switchedOnBurst(off, OVERPRESSURE, 1100)
    expect(burstPhaseOf(again, 1349)).toBe('vent')
    expect(burstPhaseOf(again, 1350)).toBe('burst')
    expect(burstPhaseOf(again, 1470)).toBe('vent')
  })

  it('waits two thirds of the track interval in a burst, rounded up, and the track interval else', () => {
    const burst = switchedOnBurst(undefined, OVERPRESSURE, 0)
    expect(gunIntervalAt(burst, 30, 0)).toBe(20)
    expect(gunIntervalAt(burst, 13, 0)).toBe(9)
    expect(gunIntervalAt(burst, 30, 200)).toBe(30)
    expect(gunIntervalAt(undefined, 30, 0)).toBe(30)
  })
})
