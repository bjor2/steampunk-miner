import { describe, expect, it } from 'vitest'
import { startScenarioProblems } from './startScenario'

describe('start scenario', () => {
  it('accepts an empty scenario', () => {
    expect(startScenarioProblems({})).toEqual([])
  })

  it('accepts the design doc example (planet 317, seed 83921, depth 82%)', () => {
    expect(startScenarioProblems({ planetTier: 317, planetSeed: 83921, depthTiles: 82 })).toEqual(
      [],
    )
  })

  it('accepts money as a decimal string, past 1e308', () => {
    expect(startScenarioProblems({ money: '1e100' })).toEqual([])
    expect(startScenarioProblems({ money: '1e5000' })).toEqual([])
  })

  it('lists every problem, not just the first', () => {
    const problems = startScenarioProblems({ planetTier: -1, depthTiles: 2.5, money: '-5' })
    expect(problems).toHaveLength(3)
  })

  it('refuses a fractional tier and an unsafe seed', () => {
    expect(startScenarioProblems({ planetTier: 1.5 })).toHaveLength(1)
    expect(startScenarioProblems({ planetSeed: 2 ** 60 })).toHaveLength(1)
  })

  it('refuses money that is not a finite decimal amount', () => {
    expect(startScenarioProblems({ money: 'Infinity' })).toHaveLength(1)
    expect(startScenarioProblems({ money: 'NaN' })).toHaveLength(1)
    expect(startScenarioProblems({ money: 'lots' })).toHaveLength(1)
  })
})
