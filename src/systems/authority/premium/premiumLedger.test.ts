import { describe, expect, it } from 'vitest'
import { EMPTY_CARGO, type Cargo } from '../../vehicle/vehicleState'
import {
  EMPTY_PREMIUM_LEDGER,
  premiumOverHoldProblems,
  premiumUnitsOfTier,
  takePremiumOfTier,
  takePremiumOfTiers,
  withPremiumCounts,
  withPremiumUnit,
  type PremiumLedger,
} from './premiumLedger'
import { oreUnitsFrom } from '../../vehicle/cargoFixtures'

const AMBER = { tier: 2, origin: '1:1', speciesId: 'honey-amber-quartzine' }
const LENS = { tier: 2, origin: '1:2', speciesId: 'p2-u3' }
const FAR = { tier: 2, origin: '10:1', speciesId: 'a-far-ore' }

const holdOf = (ore: Record<string, number>): Cargo => ({ ...EMPTY_CARGO, ore: oreUnitsFrom(ore) })

describe('premium ledger', () => {
  it('counts each collected unit under its tier and origin, in key order', () => {
    const ledger = [FAR, AMBER, LENS, AMBER].reduce(withPremiumUnit, EMPTY_PREMIUM_LEDGER)
    expect(ledger).toEqual([
      { ...AMBER, units: '2' },
      { ...LENS, units: '1' },
      { ...FAR, units: '1' },
    ])
  })

  it('orders origins by system and planet as numbers, never as text', () => {
    const ledger = withPremiumCounts(EMPTY_PREMIUM_LEDGER, [
      { ...FAR, origin: '10:1', units: '1' },
      { ...FAR, origin: '2:10', units: '1' },
      { ...FAR, origin: '2:9', units: '1' },
    ])
    expect(ledger.map((count) => count.origin)).toEqual(['2:9', '2:10', '10:1'])
  })

  it('takes a debit from the lowest key first and leaves the rest', () => {
    const ledger = withPremiumCounts(EMPTY_PREMIUM_LEDGER, [
      { ...AMBER, units: '2' },
      { ...LENS, units: '3' },
    ])
    expect(takePremiumOfTier(ledger, 2, 3n)).toEqual({
      taken: [
        { ...AMBER, units: '2' },
        { ...LENS, units: '1' },
      ],
      left: [{ ...LENS, units: '2' }],
    })
  })

  it('never takes from another tier', () => {
    const ledger = withPremiumCounts(EMPTY_PREMIUM_LEDGER, [
      { ...AMBER, units: '2' },
      { ...AMBER, tier: 3, units: '4' },
    ])
    const take = takePremiumOfTier(ledger, 3, 10n)
    expect(take.taken).toEqual([{ ...AMBER, tier: 3, units: '4' }])
    expect(take.left).toEqual([{ ...AMBER, units: '2' }])
    expect(takePremiumOfTiers(ledger, [2]).left).toEqual([{ ...AMBER, tier: 3, units: '4' }])
  })

  it('keeps counts past the safe integers exact', () => {
    const big: PremiumLedger = [{ ...AMBER, units: '9007199254740993' }]
    const ledger = withPremiumUnit(big, AMBER)
    expect(premiumUnitsOfTier(ledger, 2)).toBe(9007199254740994n)
  })

  it('lists every tier that counts more premium units than the hold holds', () => {
    const ledger = withPremiumCounts(EMPTY_PREMIUM_LEDGER, [
      { ...AMBER, units: '2' },
      { ...LENS, units: '1' },
      { ...AMBER, tier: 3, units: '1' },
    ])
    expect(premiumOverHoldProblems(ledger, holdOf({ 2: 3, 3: 1 }), 'hold')).toEqual([])
    expect(premiumOverHoldProblems(ledger, holdOf({ 2: 2 }), 'hold')).toEqual([
      'hold: tier 2 counts more premium units than the hold holds',
      'hold: tier 3 counts more premium units than the hold holds',
    ])
  })
})
