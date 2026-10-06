import { describe, expect, it } from 'vitest'
import { LOG_SCHEMA_VERSION } from './runEvent'
import { runEventProblems } from './runEventSchema'

const resourceSold = {
  v: LOG_SCHEMA_VERSION,
  seq: 412,
  tick: 8120,
  timestamp: 135.4,
  runId: 'run_2026-10-04_20-30-15',
  playerId: 'p1',
  planet: 1,
  depthTiles: 73,
  event: 'resource_sold',
  cmd: [8118, 3],
  data: { items: [{ tier: 2, amount: 6 }], value: '1.25e+3', mode: 'all' },
}

const withData = (data: unknown) => ({ ...resourceSold, data })

const debugCommandLine = (args: unknown) => ({
  ...resourceSold,
  event: 'debug_command_applied',
  data: { command: 'debug.setPlanet', args },
})

/** Debug arguments nested `depth` objects deep, counting `args` itself: `{ a: 1 }` is depth 1. */
function argsNested(depth: number): unknown {
  let value: unknown = 1
  for (let level = 0; level < depth; level++) value = { a: value }
  return value
}

describe('run event schema', () => {
  it('accepts the example line of the logging contract', () => {
    expect(runEventProblems(resourceSold)).toEqual([])
  })

  it('accepts a tick-driven event with no cmd', () => {
    const digest = {
      ...resourceSold,
      event: 'state_digest',
      cmd: undefined,
      data: { digest: '0123456789abcdef', scope: 'periodic' },
    }
    expect(runEventProblems(digest)).toEqual([])
  })

  it('refuses an unregistered event', () => {
    expect(runEventProblems({ ...resourceSold, event: 'money_earned' })).toEqual([
      'event "money_earned" is not registered',
    ])
  })

  it('refuses a reserved event', () => {
    expect(runEventProblems({ ...resourceSold, event: 'player_killed', data: {} })).toEqual([
      'event "player_killed" is reserved, not emitted',
    ])
  })

  it('refuses an event whose payload is not specified yet outside dev builds', () => {
    expect(runEventProblems({ ...resourceSold, event: 'purchase_made', data: {} })).toEqual([
      'event "purchase_made" has no registered payload yet (dev builds only)',
    ])
  })

  it('refuses an unknown payload field', () => {
    const data = { ...resourceSold.data, planet: 1 }
    expect(runEventProblems(withData(data))).toEqual([
      'resource_sold.planet is not a registered field',
    ])
  })

  it('refuses money written as a JSON number', () => {
    expect(runEventProblems(withData({ ...resourceSold.data, value: 1250 }))).toEqual([
      'resource_sold.value must be a canonical decimal string, got 1250',
    ])
  })

  it('refuses money that is not in its canonical spelling', () => {
    expect(runEventProblems(withData({ ...resourceSold.data, value: '1250' }))).toHaveLength(1)
  })

  it('refuses a float in an integer field, inside a list', () => {
    const data = { ...resourceSold.data, items: [{ tier: 2, amount: 6.5 }] }
    expect(runEventProblems(withData(data))).toEqual([
      'resource_sold.items[0].amount must be a safe integer, got 6.5',
    ])
  })

  it('refuses a value outside an enum', () => {
    expect(runEventProblems(withData({ ...resourceSold.data, mode: 'some' }))).toEqual([
      'resource_sold.mode must be one of all, single, got "some"',
    ])
  })

  it('refuses a float depth, a missing tick, an unknown envelope field and a bad cmd at once', () => {
    const { tick: _tick, ...withoutTick } = resourceSold
    const line = { ...withoutTick, depthTiles: 0.73, planetSeed: 7, cmd: [8118] }
    expect(runEventProblems(line)).toEqual([
      'envelope.planetSeed is not an envelope field',
      'envelope.tick must be a safe integer, got nothing',
      'envelope.depthTiles must be a safe integer, got 0.73',
      'envelope.cmd must be [tick, seq] as two safe integers',
    ])
  })

  it('refuses a float inside debug command arguments', () => {
    const line = {
      ...resourceSold,
      event: 'debug_command_applied',
      data: { command: 'debug.setPlanet', args: { planetIndex: 1.5 } },
    }
    expect(runEventProblems(line)).toEqual([
      'debug_command_applied.args must be an object without floats, got {"planetIndex":1.5}',
    ])
  })

  it('accepts debug command arguments nested 64 levels deep', () => {
    expect(runEventProblems(debugCommandLine(argsNested(64)))).toEqual([])
  })

  it('refuses debug command arguments nested 65 levels deep, naming the limit', () => {
    expect(runEventProblems(debugCommandLine(argsNested(65)))).toEqual([
      'debug_command_applied.args must nest at most 64 levels deep',
    ])
  })

  it('refuses debug command arguments nested 100,000 levels deep without overflowing the stack', () => {
    expect(runEventProblems(debugCommandLine(argsNested(100_000)))).toEqual([
      'debug_command_applied.args must nest at most 64 levels deep',
    ])
  })

  it('refuses a line from another log schema version', () => {
    expect(runEventProblems({ ...resourceSold, v: 1 })).toEqual(['v must be 2'])
  })
})
