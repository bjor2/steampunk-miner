import { describe, expect, it } from 'vitest'
import { startScenarioProblems } from './startScenario'

describe('start scenario', () => {
  it('accepts an empty scenario', () => {
    expect(startScenarioProblems({})).toEqual([])
  })

  it('accepts the design doc example (planet 317, seed 83921, depth 82%)', () => {
    expect(startScenarioProblems({ planetTier: 317, planetSeed: 83921, depth: 0.82 })).toEqual([])
  })

  it('accepts a 1e100 money grant', () => {
    expect(startScenarioProblems({ money: 1e100 })).toEqual([])
  })

  it('lists every problem, not just the first', () => {
    const problems = startScenarioProblems({ planetTier: -1, depth: 2, money: -5 })
    expect(problems).toHaveLength(3)
  })

  it('refuses a fractional tier and an unsafe seed', () => {
    expect(startScenarioProblems({ planetTier: 1.5 })).toHaveLength(1)
    expect(startScenarioProblems({ planetSeed: 2 ** 60 })).toHaveLength(1)
  })

  it('refuses money that is not a finite amount', () => {
    expect(startScenarioProblems({ money: Infinity })).toHaveLength(1)
    expect(startScenarioProblems({ money: NaN })).toHaveLength(1)
  })
})
