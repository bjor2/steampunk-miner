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

  it('sets each named upgrade level in the #7 track order, whatever the order in the file', () => {
    expect(startScenarioCommands({ upgrades: { hull: 2, drill_power: 5 } })).toEqual([
      { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 5 } },
      { type: 'debug.setUpgrade', payload: { upgradeId: 'hull', level: 2 } },
    ])
  })

  it('fills the core bay with debug.setCoreFragments after the planet is set', () => {
    expect(startScenarioCommands({ planetTier: 2, coreFragments: 127 })).toEqual([
      { type: 'debug.setPlanet', payload: { planetIndex: 2 } },
      { type: 'debug.setCoreFragments', payload: { count: 127 } },
    ])
  })

  it('spawns each enemy with debug.spawnEnemy, after the core bay', () => {
    const enemies = [{ kind: 'crawler', tier: 2, dx: -3, dy: 0 }]
    expect(startScenarioCommands({ coreFragments: 4, enemies })).toEqual([
      { type: 'debug.setCoreFragments', payload: { count: 4 } },
      { type: 'debug.spawnEnemy', payload: { kind: 'crawler', tier: 2, dx: -3, dy: 0 } },
    ])
  })

  it('spells money canonically in the command', () => {
    expect(grantMoneyCommand('1.50').payload.amount).toBe('1.5e+0')
  })
})
