import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { powInt, toCanonical, fromCanonical } from '../../../systems/money'
import { ECONOMY } from '../../../systems/economy/economy'
import economyFile from '../ores.economy.json'
import { ORE_ROWS } from './oreRows'
import { rarityRowProblems } from './rarityRows'

const ORES_FILE = new URL('../ores.economy.json', import.meta.url)

/** The two rows as main held them before the rarity block (#139 HS condition 3). */
const MAIN_LEAD_ROWS_TEXT = `    "leadWeightsBpByBand": {
      "plus1": [250, 300, 350, 400, 450],
      "plus2": [0, 0, 50, 100, 150]
    },`
const MAIN_SIGNATURE_CAP_TEXT = `    "signatureShareCapBpByBand": { "4": 600, "5": 800 },`

describe('rarity block', () => {
  it('accepts the shipped block', () => {
    expect(rarityRowProblems(economyFile.ore.rarity)).toEqual([])
  })

  it('keeps the lead rows and signature caps byte-identical beside it', () => {
    const text = readFileSync(ORES_FILE, 'utf8')
    expect(text).toContain(MAIN_LEAD_ROWS_TEXT)
    expect(text).toContain(MAIN_SIGNATURE_CAP_TEXT)
  })

  it('stores legacy weights deep-equal to the lead rows', () => {
    const { legacy } = economyFile.ore.rarity.weightsBpByBand
    expect({ plus1: legacy.uncommon, plus2: legacy.rare }).toEqual(
      economyFile.ore.leadWeightsBpByBand,
    )
    expect([...legacy.epic, ...legacy.mythic].every((weight) => weight === 0)).toBe(true)
  })

  it('stores each multiplier as the value ratio to the tier offset', () => {
    for (const tier of ORE_ROWS.rarity.tiers) {
      const derived = powInt(ECONOMY.ore.valueRatio, tier.tierOffset)
      expect(toCanonical(fromCanonical(tier.multText))).toBe(toCanonical(derived))
    }
  })

  it('has no family multiplier and no gate class', () => {
    expect(Object.keys(economyFile.ore.rarity)).not.toContain('familyMult')
    expect(Object.keys(economyFile.ore.rarity)).not.toContain('gateClass')
  })

  it('refuses a broken block and lists every problem', () => {
    const broken = {
      alpha: 0,
      tiers: [
        { id: 'common', tierOffset: 0, mult: '1', firstBand: 2, firstPlanet: 1 },
        { id: 'uncommon', tierOffset: 2, mult: 'x', firstBand: 0, firstPlanet: 0 },
        { id: 'epic', tierOffset: 2, mult: '2.25', firstBand: 3, firstPlanet: 3 },
      ],
      meanPpmByBand: [1012500, 999999, 1023750, 1055000, 1056250],
      weightsBpByBand: {
        legacy: { uncommon: [250, 300, 350, 400, 450], epic: [0, 0, 0, 0, 5] },
        mixed: { uncommon: [9000, 142, 155, 97, 224], epic: [2000, 0, 31, 18, 43] },
        deep: { uncommon: [250, 142, 155, 97, 224], epic: [0, 0, 17, 35, 70] },
      },
      meanToleranceBp: 'half',
      tripClampShareBp: 10001,
      tripClampTierIds: ['legendary'],
    }
    expect(rarityRowProblems(broken)).toEqual([
      'ore.rarity.alpha must be a whole number from 1',
      'ore.rarity.tiers[1].tierOffset must be 1, its place in the list',
      'ore.rarity.tiers[1].mult must be a decimal string',
      'ore.rarity.tiers[1].firstBand must be a band from 1 to 5',
      'ore.rarity.tiers[1].firstPlanet must be a planet from 1',
      'the common tier is drawn from band 1 of planet 1',
      'ore.rarity.meanPpmByBand needs 5 means in ppm, each from 1000000',
      'the legacy epic weight must be 0: the tier starts later',
      "band 1's mixed rarity weights add up to more than 10000",
      'the mixed epic weight is drawn above its first band',
      'ore.rarity.meanToleranceBp must be a decimal',
      'ore.rarity.tripClampShareBp must be basis points',
      'ore.rarity.tripClampTierIds must name rarity tiers',
    ])
  })

  it('refuses deep rows that draw rare or above before band 3, d >= 0.35 (ticket 738)', () => {
    const rarity = structuredClone(economyFile.ore.rarity)
    rarity.weightsBpByBand.deep.rare = [0, 63, 56, 111, 223]
    rarity.weightsBpByBand.deep.uncommon = [250, 142, 155, 97, 224]
    expect(rarityRowProblems(rarity)).toEqual(['the deep rare weight is drawn above band 3'])
    rarity.weightsBpByBand.deep.rare = [0, 0, 56, 111, 223]
    expect(rarityRowProblems(rarity)).toEqual([])
  })

  it('refuses a weight set that leaves out a tier', () => {
    const rarity = structuredClone(economyFile.ore.rarity) as Record<string, unknown>
    rarity.weightsBpByBand = { ...economyFile.ore.rarity.weightsBpByBand, mixed: {} }
    expect(rarityRowProblems(rarity)).toEqual([
      'ore.rarity.weightsBpByBand.mixed needs each tier above common: 5 bp',
    ])
  })
})
