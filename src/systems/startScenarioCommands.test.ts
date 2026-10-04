import { describe, expect, it } from 'vitest'
import { grantMoneyCommand, startScenarioCommands } from './startScenarioCommands'

describe('start scenario commands', () => {
  it('turns each authority-owned field into its debug command', () => {
    expect(startScenarioCommands({ planetTier: 2, planetSeed: 83921, money: '1e30' })).toEqual([
      { type: 'debug.setPlanet', payload: { planetIndex: 2 } },
      { type: 'debug.setPlanetSeed', payload: { planetSeed: 83921 } },
      { type: 'debug.setMoney', payload: { amount: '1e+30' } },
    ])
  })

  it('leaves the depth to the client, which owns the vehicle pose', () => {
    expect(startScenarioCommands({ depthTiles: 50 })).toEqual([])
  })

  it('spells money canonically in the command', () => {
    expect(grantMoneyCommand('1.50').payload.amount).toBe('1.5e+0')
  })
})
