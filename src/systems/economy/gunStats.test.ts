import { describe, expect, it } from 'vitest'
import { add, ceilMilli, fromCanonical, mul, ZERO_MONEY } from '../money'
import { GUN_SHOT_QUANTA } from '../vehicle/energyQuanta'
import {
  gunFireIntervalTicks,
  gunLevelPrice,
  gunMountPrice,
  gunMountStep,
  gunTopStep,
  gunShotDamage,
  nextGunPrice,
} from './gunStats'
import { oreTier, oreValue } from './oreEconomy'
import { paceScale } from './planetEconomy'
import { stepOfMajor } from './upgradeSteps'
import { drillPower } from './vehicleStats'

const m = fromCanonical

function bandFiveOre(units: string, planetIndex: number) {
  return ceilMilli(mul(mul(m(units), oreValue(oreTier(planetIndex, 5))), paceScale(planetIndex)))
}

describe('gun stats (#107 numbers)', () => {
  it('deals a quarter of the drill power a shot, with no scaling of its own (acceptance 1)', () => {
    for (const level of [0, 12, 21, 30, 250]) {
      expect(gunShotDamage(level)).toEqual(mul(m('0.25'), drillPower(level)))
    }
  })

  // #107 set its 6 +- 1 shots against the spawn-point kinds. A shot is a quarter of drill power,
  // which grows x1.243 a purchase since #552 against enemy health's 1.12 a tier, so the on-curve
  // shots now drift: combat damage is its own design ticket (#555, the GD ruling on #551).
  it.todo(
    'kills an on-curve band-3 enemy in 6 +- 1 shots at planets 4 and 7 (#107 acceptance 2; waits on the combat damage design of #555)',
  )
  it.todo(
    'needs the same shots for an on-curve kill on every planet, so nothing drifts (#107; waits on the combat damage design of #555)',
  )

  it('fires every 30 ticks at the mount and saturates toward 12 by the 16th major', () => {
    expect(gunFireIntervalTicks(gunMountStep())).toBe(30)
    expect(gunFireIntervalTicks(stepOfMajor(9))).toBe(21)
    expect(gunFireIntervalTicks(gunTopStep())).toBe(18)
    const steps = Array.from({ length: gunTopStep() - gunMountStep() + 1 }, (_, at) => at + 10)
    const intervals = steps.map(gunFireIntervalTicks)
    expect(intervals.every((ticks, at) => at === 0 || ticks <= intervals[at - 1])).toBe(true)
    expect(Math.min(...intervals)).toBeGreaterThan(12)
  })

  it('rounds the interval half up on the pips: 29 ticks half way to the second major', () => {
    expect(gunFireIntervalTicks(gunMountStep() + 5)).toBe(29)
  })

  it('takes half an energy unit a shot: 120 quanta', () => {
    expect(GUN_SHOT_QUANTA).toBe(120)
  })

  it('prices the mount at 1 band-5 ore unit of the purchase planet (GD ruling on #371)', () => {
    for (const planet of [4, 5, 9]) {
      expect(gunMountPrice(planet)).toEqual(bandFiveOre('1', planet))
      expect(nextGunPrice(0, planet)).toEqual(gunMountPrice(planet))
    }
  })

  it('prices level g -> g + 1 at 8 * 1.25^(g - 1) band-5 ore units', () => {
    expect(gunLevelPrice(1, 4)).toEqual(bandFiveOre('8', 4))
    expect(gunLevelPrice(2, 4)).toEqual(bandFiveOre('10', 4))
    expect(gunLevelPrice(3, 4)).toEqual(bandFiveOre('12.5', 4))
  })

  it('mounts in one buy and splits every later major into ten steps that sum to its price', () => {
    expect(gunMountStep()).toBe(10)
    expect(gunTopStep()).toBe(160)
    for (const level of [1, 2, 9, 15]) {
      const steps = Array.from({ length: 10 }, (_, pip) =>
        nextGunPrice(stepOfMajor(level) + pip, 6),
      )
      const total = steps.reduce((sum, price) => add(sum, price), ZERO_MONEY)
      expect(total).toEqual(gunLevelPrice(level, 6))
    }
  })
})
