import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { fromCanonical } from '../systems/money'
import { createDebugApi, DebugCommandNotImplementedError } from './debugApi'

beforeEach(() => resetGameStore())

describe('debug api', () => {
  it('drives the game store through the design doc command names', () => {
    const debug = createDebugApi()
    debug.setPlanet(300)
    debug.setPlanetSeed(83921)
    debug.giveMoney('1e100')
    expect(useGameStore.getState()).toMatchObject({
      planetTier: 300,
      planetSeed: 83921,
      money: fromCanonical('1e100'),
    })
  })

  it('tells a bot why a scenario would be refused before it tries', () => {
    expect(createDebugApi().startScenarioProblems({ depth: 2 })).toHaveLength(1)
  })

  it('says plainly that a command is not built yet', () => {
    expect(() => createDebugApi().teleportToCore()).toThrow(DebugCommandNotImplementedError)
  })
})
