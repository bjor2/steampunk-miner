import { describe, expect, it } from 'vitest'
import { parseStartScenario, startScenarioProblems } from './startScenario'

describe('start scenario', () => {
  it('accepts an empty scenario', () => {
    expect(startScenarioProblems({})).toEqual([])
  })

  it('accepts the design doc example (planet 317, seed 83921, depth 82%)', () => {
    expect(startScenarioProblems({ planetTier: 317, planetSeed: 83921, depth: 0.82 })).toEqual([])
  })

  it('accepts money as a decimal string, past 1e308', () => {
    expect(startScenarioProblems({ money: '1e100' })).toEqual([])
    expect(startScenarioProblems({ money: '1e5000' })).toEqual([])
  })

  it('lists every problem, not just the first', () => {
    const problems = startScenarioProblems({ planetTier: -1, depth: 2, money: '-5' })
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

describe('parse start scenario', () => {
  it('reads the fields of a scenario', () => {
    const { scenario, problems } = parseStartScenario('{"planetTier":317,"planetSeed":83921}')
    expect(problems).toEqual([])
    expect(scenario).toEqual({ planetTier: 317, planetSeed: 83921 })
  })

  it('refuses text that is not JSON', () => {
    expect(parseStartScenario('{nope').problems).toEqual(['scenario is not valid JSON'])
  })

  it('refuses JSON that is not an object', () => {
    expect(parseStartScenario('[1,2]').problems).toHaveLength(1)
  })

  it('refuses a field it does not know instead of ignoring it', () => {
    expect(parseStartScenario('{"drillLevel":1500}').problems).toEqual([
      'unknown scenario field "drillLevel"',
    ])
  })

  it('refuses a field of the wrong type', () => {
    expect(parseStartScenario('{"planetTier":"3"}').problems).toContain(
      'planetTier must be a number',
    )
    expect(parseStartScenario('{"money":1e30}').problems).toContain(
      'money must be a decimal string',
    )
  })

  it('also reports the value rules', () => {
    expect(parseStartScenario('{"depth":3}').problems).toHaveLength(1)
  })
})
