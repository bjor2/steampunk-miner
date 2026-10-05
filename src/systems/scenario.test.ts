import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  isHintsEnabled,
  parseScenario,
  startOfScenario,
  validateScenario,
  type Scenario,
} from './scenario'

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

  it('accepts core fragments now that the core bay exists, and refuses a fraction', () => {
    expect(validateScenario({ ...minimal, start: { coreFragments: 63 } })).toEqual([])
    expect(validateScenario({ ...minimal, start: { coreFragments: 1.5 } })).toEqual([
      'scenario.start.coreFragments must be a whole number from 0 to 9007199254740991, got 1.5',
    ])
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

  it('checks enemy kinds, tiers and offsets against the #9 registry', () => {
    const enemies = [
      { kind: 'crawler', tier: 3, dx: -2 },
      { kind: 'dragon', tier: 1.5 },
      { tier: 2, fangs: 4 },
    ]
    expect(validateScenario({ ...minimal, start: { enemies } })).toEqual([
      'scenario.start.enemies[1].kind "dragon" is not a registered enemy id (crawler, burrower)',
      'scenario.start.enemies[1].tier must be a whole number from 0 to 9007199254740991, got 1.5',
      'scenario.start.enemies[2].fangs is not a scenario field',
      'scenario.start.enemies[2].kind is required',
    ])
  })

  it('checks facility ids and their one level of the slice', () => {
    const facilities = { shop: 1, garage: 1, workshop: 2 }
    expect(validateScenario({ ...minimal, start: { facilities } })).toEqual([
      'scenario.start.facilities key "garage" is not a registered facility id (shop, workshop, charging)',
      'scenario.start.facilities.workshop must be a whole number from 1 to 1, got 2',
    ])
  })

  it('checks the platform state against the registry and the core bay', () => {
    const start = (platformState: string, coreFragments: number) => ({
      ...minimal,
      worldSeed: 83921,
      start: { platformState, coreFragments },
    })
    expect(validateScenario(start('core_drive', 63))).toEqual([])
    expect(validateScenario(start('outpost', 10))).toEqual([])
    expect(validateScenario(start('core_drive', 62))).toEqual([
      'scenario.start.platformState "core_drive" does not match coreFragments 62 (the core drive shows from 63)',
    ])
    expect(validateScenario(start('hangar', 0))).toEqual([
      'scenario.start.platformState "hangar" is not a registered platform state (outpost, core_drive)',
    ])
  })

  it('keeps hints off unless the file turns them on (#16)', () => {
    expect(isHintsEnabled(minimal)).toBe(false)
    expect(isHintsEnabled({ ...minimal, hintsEnabled: true })).toBe(true)
    expect(validateScenario({ ...minimal, hintsEnabled: 'yes' })).toEqual([
      'scenario.hintsEnabled must be true or false, got "yes"',
    ])
  })

  it('refuses text that is not JSON', () => {
    expect(parseScenario('{nope').problems).toEqual(['scenario is not valid JSON'])
  })
})

describe('scenario start state', () => {
  it('places enemies where spawnEnemy would when the file gives no offset', () => {
    const scenario: Scenario = {
      ...minimal,
      start: {
        enemies: [
          { kind: 'burrower', tier: 7 },
          { kind: 'crawler', tier: 1, dx: -3, dy: 1 },
        ],
      },
    }
    expect(startOfScenario(scenario).enemies).toEqual([
      { kind: 'burrower', tier: 7, dx: 4, dy: 0 },
      { kind: 'crawler', tier: 1, dx: -3, dy: 1 },
    ])
  })

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
