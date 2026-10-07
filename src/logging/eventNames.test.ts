import { describe, expect, it } from 'vitest'
import { ALL_RUN_EVENT_NAMES, RUN_EVENT_REGISTRY } from './eventNames'
import { envelopeDuplicateProblems, floatFieldProblems } from './runEventSchema'

describe('run event registry', () => {
  it('keeps every name in snake_case so analytics can group them', () => {
    for (const name of ALL_RUN_EVENT_NAMES) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })

  it('registers the events of the slice acceptance sequence and the platform loop', () => {
    expect(ALL_RUN_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        'game_started',
        'planet_entered',
        'resource_sold',
        'upgrade_purchased',
        'core_reached',
        'core_completed',
        'planet_unlocked',
        'dock_entered',
        'dock_left',
        'energy_recharged',
        'repair_purchased',
        'rescue_triggered',
        'state_digest',
        'debug_command_applied',
      ]),
    )
  })

  it('has no payload field that repeats an envelope field', () => {
    expect(envelopeDuplicateProblems(RUN_EVENT_REGISTRY)).toEqual([])
  })

  it('finds a payload field that repeats an envelope field', () => {
    const registry = {
      dock_entered: { group: 'platform', level: 'core', payload: { planet: 'integer' } },
    } as const
    expect(envelopeDuplicateProblems(registry)).toEqual([
      'dock_entered.planet repeats an envelope field',
    ])
  })

  it('allows floats only in perf_sample', () => {
    expect(floatFieldProblems(RUN_EVENT_REGISTRY)).toEqual([])
    const registry = {
      mining_interval: {
        group: 'mining',
        level: 'core',
        payload: { collected: { listOf: { value: 'float' } } },
      },
    } as const
    expect(floatFieldProblems(registry)).toEqual([
      'mining_interval.collected is a float outside perf_sample',
    ])
    const optionalFloat = {
      snapshot_written: { group: 'run', level: 'perf', payload: { mb: { optional: 'float' } } },
    } as const
    expect(floatFieldProblems(optionalFloat)).toEqual([
      'snapshot_written.mb is a float outside perf_sample',
    ])
  })

  it('reserves player_killed and the multiplayer names', () => {
    expect(RUN_EVENT_REGISTRY.player_killed.payload).toBe('reserved')
    expect(RUN_EVENT_REGISTRY.player_joined.payload).toBe('reserved')
  })
})
