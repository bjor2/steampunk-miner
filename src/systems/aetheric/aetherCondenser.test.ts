import { describe, expect, it } from 'vitest'
import AETHERIC_TUNING from '../../data/aetheric.json'
import { condense, CONDENSE_RATIO } from './condense'

describe('aether condenser', () => {
  it('reads its ratio from aetheric.json', () => {
    expect(CONDENSE_RATIO).toBe(AETHERIC_TUNING.heatUnitsPerEnergyQuantum)
  })

  it('burns heat into energy at the json ratio while the tank has room', () => {
    const heat = CONDENSE_RATIO * 10
    expect(condense(heat, 100, 1000, CONDENSE_RATIO)).toEqual({ heat: 0, energy: 110 })
  })

  it('stops at full charge and keeps the heat it did not burn', () => {
    const heat = CONDENSE_RATIO * 10
    expect(condense(heat, 997, 1000, CONDENSE_RATIO)).toEqual({
      heat: heat - CONDENSE_RATIO * 3,
      energy: 1000,
    })
  })

  it('leaves a full tank and its heat as they are', () => {
    expect(condense(50, 1000, 1000, CONDENSE_RATIO)).toEqual({ heat: 50, energy: 1000 })
  })

  it('keeps a heat remainder smaller than one exchange, so both stay integers', () => {
    const result = condense(7, 0, 1000, 3)
    expect(result).toEqual({ heat: 1, energy: 2 })
    expect(Number.isInteger(result.heat) && Number.isInteger(result.energy)).toBe(true)
  })

  it('does nothing with no heat', () => {
    expect(condense(0, 10, 1000, CONDENSE_RATIO)).toEqual({ heat: 0, energy: 10 })
  })
})
