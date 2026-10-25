import { describe, expect, it } from 'vitest'
import { fromCanonical, ZERO_MONEY } from '../systems/money'
import {
  casingPlanetMediansOf,
  casingPriceLinesOf,
  casingPriceProblemsOf,
  type CasingPriceRun,
} from './casingPriceBars'
import type { PlanetCasingSpend } from './casingSpend'

interface Shares {
  casing: string
  spend: string
  wallet?: string
  gradePrice?: string
}

function planetRow(planet: number, shares: Shares): PlanetCasingSpend {
  return {
    planet,
    casingSpend: fromCanonical(shares.casing),
    spend: fromCanonical(shares.spend),
    arrivalWallet: fromCanonical(shares.wallet ?? '10000'),
    arrivalGradePrice: fromCanonical(shares.gradePrice ?? '500'),
    collapses: 0,
  }
}

/** A run whose five planets all have the same shares, then `overrides` by planet. */
function runOf(worldSeed: number, overrides: Record<number, Shares> = {}): CasingPriceRun {
  const planets = new Map<number, PlanetCasingSpend>()
  for (const planet of [1, 2, 3, 4, 5]) {
    planets.set(planet, planetRow(planet, overrides[planet] ?? { casing: '15', spend: '100' }))
  }
  return { worldSeed, casing: { planets, wallet: ZERO_MONEY } }
}

describe('casing price bars (#894)', () => {
  it('passes casing at 15% of spend and the next grade at 5% of money on arrival', () => {
    expect(casingPriceProblemsOf([runOf(1), runOf(2), runOf(3)])).toEqual([])
  })

  it('holds the share band at 12% and 20% inclusive', () => {
    const low = runOf(1, { 2: { casing: '12', spend: '100' }, 3: { casing: '20', spend: '100' } })
    expect(casingPriceProblemsOf([low])).toEqual([])
  })

  it('fails a planet whose median casing share is outside 12-20%', () => {
    const cheap = { 4: { casing: '6', spend: '100' } }
    const problems = casingPriceProblemsOf([runOf(1, cheap), runOf(2, cheap), runOf(3)])
    expect(problems).toEqual(['P4: casing is 6.00% of spend, outside 12%-20%'])
  })

  it('judges the median seed, so one seed off the band passes', () => {
    const dear = { 2: { casing: '40', spend: '100' } }
    expect(casingPriceProblemsOf([runOf(1, dear), runOf(2), runOf(3)])).toEqual([])
  })

  it('fails a jump in whose next grade costs more than 25% of the money held', () => {
    const poor = { 3: { casing: '15', spend: '100', wallet: '1000', gradePrice: '260' } }
    const problems = casingPriceProblemsOf([runOf(1, poor)])
    expect(problems).toEqual(['P3: the next grade costs 26.00% of money on arrival'])
  })

  it('never judges planet 1 on arrival: the run starts there', () => {
    const start = { 1: { casing: '15', spend: '100', wallet: '1', gradePrice: '240' } }
    expect(casingPriceProblemsOf([runOf(1, start)])).toEqual([])
  })

  it('names a planet no seed bought anything on', () => {
    const idle = { 5: { casing: '0', spend: '0' } }
    expect(casingPriceProblemsOf([runOf(1, idle)])).toEqual(['P5: no seed bought anything there'])
  })

  it('prints one line per planet with its shares and collapses', () => {
    const lines = casingPriceLinesOf([runOf(1)])
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe(
      'P1: casing 15.00% of spend, next grade on arrival 5.00% of money held, collapses 0',
    )
    expect(casingPlanetMediansOf([runOf(1)])[4]).toEqual({
      planet: 5,
      casingShareBp: 1500,
      arrivalShareBp: 500,
      collapses: 0,
    })
  })
})
