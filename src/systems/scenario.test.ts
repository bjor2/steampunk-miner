import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseScenario, startOfScenario, validateScenario, type Scenario } from './scenario'

const readScenarioFile = (name: string) =>
  readFileSync(new URL(`../../scenarios/${name}`, import.meta.url), 'utf8')

const minimal: Scenario = {
  scenarioVersion: 1,
  name: 'minimal',
  worldSeed: 7,
  start: {},
}

describe('scenario validation', () => {
  it('accepts the committed planet 1 start scenario', () => {
    expect(parseScenario(readScenarioFile('planet1-start.scenario.json')).problems).toEqual([])
  })

  it('lists every problem in the deliberately broken file', () => {
    expect(parseScenario(readScenarioFile('broken.scenario.json')).problems).toEqual([
      'scenario.start.fuel is not a scenario field',
      'scenario.start.depthTiles must be a whole number from 0 to 9007199254740991, got 12.5',
      'scenario.start.money must be a decimal string >= 0 such as "1e30", got "1,000"',
      'scenario.start.upgrades.laser is not a registered upgrade id',
      'scenario.start.upgrades.hull must be a whole number from 0 to 9007199254740991, got -2',
      'scenario.start.upgrades cannot be applied until the upgrade loop (Build 6) exists',
    ])
  })

  it('needs the version, name, world seed and start', () => {
    expect(validateScenario({})).toEqual([
      'scenario.scenarioVersion is required',
      'scenario.name is required',
      'scenario.worldSeed is required',
      'scenario.start is required',
    ])
  })

  it('refuses another scenario version rather than guessing at it', () => {
    expect(validateScenario({ ...minimal, scenarioVersion: 2 })).toEqual([
      'scenario.scenarioVersion must be 1, got 2',
    ])
  })

  it('refuses a float depth and money written as a number', () => {
    expect(validateScenario({ ...minimal, start: { depthTiles: 0.82, money: 1e30 } })).toHaveLength(
      2,
    )
  })

  it('refuses depth given both ways', () => {
    expect(validateScenario({ ...minimal, start: { depthBp: 10, depthTiles: 3 } })).toContain(
      'scenario.start has both depthBp and depthTiles; give one',
    )
  })

  it('checks depthBp against the radius range, then waits for the generator', () => {
    expect(validateScenario({ ...minimal, start: { depthBp: 10001 } })).toEqual([
      'scenario.start.depthBp must be a whole number from 0 to 10000, got 10001',
      'scenario.start.depthBp cannot be applied until the planet radius from the generator (Build 2) exists',
    ])
  })

  it('accepts empty collections for systems that do not exist yet', () => {
    const start = { inventory: [], upgrades: {}, unlocks: [], coreFragments: 0 }
    expect(validateScenario({ ...minimal, start })).toEqual([])
  })

  it('refuses an unknown unlock id', () => {
    expect(validateScenario({ ...minimal, start: { unlocks: ['jetpack'] } })).toContain(
      'scenario.start.unlocks[0] "jetpack" is not a registered unlock id',
    )
  })

  it('refuses a script step it cannot run and steps that go back in time', () => {
    const script = [
      { tick: 60, command: 'fastForward', args: { ticks: 10 } },
      { tick: 30, command: 'teleport', args: { ticks: 1 } },
    ]
    expect(validateScenario({ ...minimal, script })).toEqual([
      'scenario.script[1].command must be one of fastForward, got "teleport"',
      'scenario.script[1].tick is before the step above it',
    ])
  })

  it('refuses text that is not JSON', () => {
    expect(parseScenario('{nope').problems).toEqual(['scenario is not valid JSON'])
  })
})

describe('scenario start state', () => {
  it('puts the player on the planet with the money and depth the file names', () => {
    const scenario: Scenario = {
      ...minimal,
      worldSeed: 83921,
      start: { planet: 2, depthTiles: 120, money: '1e30' },
    }
    expect(startOfScenario(scenario)).toEqual({
      planetTier: 2,
      planetSeed: 83921,
      depthTiles: 120,
      money: '1e30',
    })
  })
})
