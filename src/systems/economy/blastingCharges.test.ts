import { describe, expect, it } from 'vitest'
import { ART_RULES } from '../art/artIds'
import {
  ceilMilli,
  cmp,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  toCanonical,
  type Money,
} from '../money'
import {
  blastEnemyDamage,
  blastHardnessCap,
  blastSelfHit,
  chargeFuseTicks,
  isInBlastRadius,
  keptBlastOreUnits,
  rackCapacity,
  rackMaxSlotLevel,
  rackSlotPrice,
  restockPrice,
} from './blastingCharges'
import { ENEMY_KINDS } from './economyDefinition'
import { readEconomy } from './readEconomy'
import economyFile from './economy.json'
import { enemyHealth, enemyTier } from './enemyStats'
import { blockHardness, coreHardness, oreTier, oreValue } from './oreEconomy'
import { hullMax, onCurveLevel } from './vehicleStats'

const MM = 1000
const BAND_5_UNIT_ON_PLANET_7 = oreValue(oreTier(7, 5))

function textOf(amount: Money): string {
  return toCanonical(amount)
}

function tilesInRadius(): number {
  let count = 0
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) if (isInBlastRadius(dx * MM, dy * MM)) count++
  }
  return count
}

describe('blasting charges economy', () => {
  it('lights a 2 s fuse and breaks the 21 tiles within 2.5 tiles of the charge', () => {
    expect(chargeFuseTicks()).toBe(120)
    expect(tilesInRadius()).toBe(21)
  })

  it('reaches a vehicle 2.5 tiles from the charge and not one a millimetre further', () => {
    expect(isInBlastRadius(2500, 0)).toBe(true)
    expect(isInBlastRadius(0, -2501)).toBe(false)
  })

  it('racks 3 charges and one more per slot, up to the 8 slots the art draws', () => {
    expect(rackCapacity(0)).toBe(3)
    expect(rackCapacity(rackMaxSlotLevel())).toBe(8)
    expect(rackCapacity(rackMaxSlotLevel())).toBe(ART_RULES.chargeRackSlots)
  })

  it('prices a charge at 2 band-5 ore units of the planet it is bought on', () => {
    const unit = BAND_5_UNIT_ON_PLANET_7
    expect(textOf(restockPrice(1, 7))).toBe(textOf(ceilMilli(mul(fromSafeInteger(2), unit))))
    expect(textOf(restockPrice(3, 7))).toBe(textOf(ceilMilli(mul(fromSafeInteger(6), unit))))
  })

  it('prices the five rack slots at 6, 8, 10, 12 and 14 band-5 ore units', () => {
    const prices = [0, 1, 2, 3, 4].map((slot) => textOf(rackSlotPrice(slot, 7)))
    const expected = [6, 8, 10, 12, 14].map((units) =>
      textOf(ceilMilli(mul(fromSafeInteger(units), BAND_5_UNIT_ON_PLANET_7))),
    )
    expect(prices).toEqual(expected)
    expect(() => rackSlotPrice(5, 7)).toThrow(RangeError)
  })

  it('hits an on-curve hull for about 30% in band 3, the same on every planet', () => {
    const shareOn = (planet: number) =>
      div(blastSelfHit(planet, 3), hullMax(onCurveLevel('hull', planet)))
    expect(textOf(shareOn(7))).toBe(textOf(shareOn(10)))
    expect(cmp(shareOn(7), fromCanonical('0.25'))).toBe(1)
    expect(cmp(shareOn(7), fromCanonical('0.35'))).toBe(-1)
  })

  it('takes twice its health off any enemy at the blast tile, so it dies', () => {
    for (const kind of ENEMY_KINDS) {
      const health = enemyHealth(kind, enemyTier(7, 4))
      expect(textOf(blastEnemyDamage(kind, 7, 4))).toBe(textOf(mul(fromSafeInteger(2), health)))
    }
  })

  it('breaks rock up to band 5 of the planet and never the harder core', () => {
    expect(textOf(blastHardnessCap(7))).toBe(textOf(blockHardness(7, 5)))
    expect(cmp(coreHardness(7), blastHardnessCap(7))).toBe(1)
  })

  it('keeps 40% of the ore units a blast breaks, dithered to whole units', () => {
    const steps = 100
    const keptOver = (units: number) =>
      Array.from({ length: steps }, (_, step) =>
        keptBlastOreUnits(units, div(fromSafeInteger(step), fromSafeInteger(steps))),
      ).reduce((total, kept) => total + kept, 0)
    expect(keptBlastOreUnits(5, fromSafeInteger(0))).toBe(2)
    expect(keptOver(3)).toBe(120)
    expect(keptOver(7)).toBe(280)
  })

  it('refuses a rack whose size does not match its slot prices', () => {
    const broken = structuredClone(economyFile)
    broken.blastingCharges.rackMax = 9
    expect(readEconomy(broken).problems).toEqual([
      'blastingCharges.rackMax must be rackStart plus one per rackSlotCost level',
    ])
  })
})
